package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

func marshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

type ClaudeMessageRequest struct {
	Model     string                 `json:"model"`
	Messages  []ClaudeMessage        `json:"messages"`
	System    string                 `json:"system,omitempty"`
	MaxTokens int                    `json:"max_tokens"`
	Tools     []ClaudeToolDefinition `json:"tools,omitempty"`
}

type ClaudeMessage struct {
	Role    string        `json:"role"`
	Content []ClaudePart  `json:"content"`
}

type ClaudePart struct {
	Type      string              `json:"type"`
	Text      string              `json:"text,omitempty"`
	ID        string              `json:"id,omitempty"`
	Name      string              `json:"name,omitempty"`
	Input     map[string]any      `json:"input,omitempty"`
	ToolUseID string              `json:"tool_use_id,omitempty"`
	Content   string              `json:"content,omitempty"`
}

type ClaudeToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

type ClaudeMessageResponse struct {
	ID         string        `json:"id"`
	Content    []ClaudePart  `json:"content"`
	StopReason string        `json:"stop_reason"`
	Usage      *ClaudeUsage  `json:"usage,omitempty"`
}

type ClaudeUsage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

type ClaudeMessagesProvider interface {
	CreateMessage(ctx context.Context, req ClaudeMessageRequest) (*ClaudeMessageResponse, error)
}

type claudeA2AModelAdapter struct {
	provider          ClaudeMessagesProvider
	modelName         string
	agentName         string
	telemetryRecorder telemetry.ModelRecorder
	eventingRecorder  eventing.ModelRecorder
}

func NewClaudeA2AModelAdapter(provider ClaudeMessagesProvider, modelName, agentName string, telemetryRecorder telemetry.ModelRecorder, eventingRecorder eventing.ModelRecorder) A2AModelProvider {
	return &claudeA2AModelAdapter{
		provider:          provider,
		modelName:         modelName,
		agentName:         agentName,
		telemetryRecorder: telemetryRecorder,
		eventingRecorder:  eventingRecorder,
	}
}

func (a *claudeA2AModelAdapter) A2ATurn(ctx context.Context, messages []protocol.Message, toolOutcomes []A2AToolOutcome, tools []A2AToolDefinition, _ EventStreamInterface) (*A2ATurnResult, error) {
	ctx, span := a.telemetryRecorder.StartModelExecution(ctx, a.modelName, "claude")
	defer span.End()

	operationData := map[string]string{"model": a.modelName, "modelType": "claude"}
	ctx = a.eventingRecorder.Start(ctx, "LLMCall", fmt.Sprintf("Calling Claude model %s", a.modelName), operationData)

	claudeMessages := convertA2AToClaudeMessages(messages, toolOutcomes)
	claudeTools := convertA2AToolsToClaudeTools(tools)

	req := ClaudeMessageRequest{
		Model:     a.modelName,
		Messages:  claudeMessages,
		MaxTokens: 4096,
		Tools:     claudeTools,
	}

	resp, err := a.provider.CreateMessage(ctx, req)
	if err != nil {
		a.telemetryRecorder.RecordError(span, err)
		a.eventingRecorder.Fail(ctx, "LLMCall", fmt.Sprintf("Claude call failed: %v", err), err, operationData)
		return nil, err
	}

	result := convertClaudeResponseToA2ATurnResult(resp)
	a.telemetryRecorder.RecordSuccess(span)
	a.eventingRecorder.Complete(ctx, "LLMCall", "Claude call completed successfully", operationData)
	if resp.Usage != nil {
		a.telemetryRecorder.RecordTokenUsage(span, resp.Usage.InputTokens, resp.Usage.OutputTokens, resp.Usage.InputTokens+resp.Usage.OutputTokens)
	}

	return result, nil
}

func convertA2AToClaudeMessages(messages []protocol.Message, toolOutcomes []A2AToolOutcome) []ClaudeMessage {
	result := make([]ClaudeMessage, 0, len(messages)+len(toolOutcomes))
	for _, msg := range messages {
		role := "user"
		if msg.Role == protocol.MessageRoleAgent {
			role = "assistant"
		}
		parts := make([]ClaudePart, 0, len(msg.Parts))
		for _, part := range msg.Parts {
			switch p := part.(type) {
			case protocol.TextPart:
				parts = append(parts, ClaudePart{Type: "text", Text: p.Text})
			case *protocol.TextPart:
				parts = append(parts, ClaudePart{Type: "text", Text: p.Text})
			}
		}
		if len(parts) == 0 {
			parts = append(parts, ClaudePart{Type: "text", Text: "."})
		}
		result = append(result, ClaudeMessage{Role: role, Content: parts})
	}
	if len(toolOutcomes) > 0 {
		parts := make([]ClaudePart, 0, len(toolOutcomes))
		for _, outcome := range toolOutcomes {
			content := outcome.Content
			if content == "" {
				content = outcome.Error
			}
			if content == "" {
				content = "{}"
			}
			parts = append(parts, ClaudePart{
				Type:      "tool_result",
				ToolUseID: outcome.ToolCallID,
				Content:   content,
			})
		}
		result = append(result, ClaudeMessage{Role: "user", Content: parts})
	}
	return result
}

func convertA2AToolsToClaudeTools(tools []A2AToolDefinition) []ClaudeToolDefinition {
	result := make([]ClaudeToolDefinition, len(tools))
	for i, tool := range tools {
		result[i] = ClaudeToolDefinition{
			Name:        tool.Name,
			Description: tool.Description,
			InputSchema: tool.Parameters,
		}
	}
	return result
}

func convertClaudeResponseToA2ATurnResult(resp *ClaudeMessageResponse) *A2ATurnResult {
	var text string
	var toolCalls []A2AToolCall

	for _, part := range resp.Content {
		switch part.Type {
		case "text":
			text += part.Text
		case "tool_use":
			tc := A2AToolCall{
				ID:        part.ID,
				Name:      part.Name,
				Arguments: "{}",
			}
			if part.Input != nil {
				if raw, err := marshalJSON(part.Input); err == nil {
					tc.Arguments = string(raw)
				}
			}
			toolCalls = append(toolCalls, tc)
		}
	}

	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(text),
	})

	result := &A2ATurnResult{
		Message:   message,
		Content:   text,
		ToolCalls: toolCalls,
	}
	if resp.Usage != nil {
		result.Usage = &A2ATurnUsage{
			PromptTokens:     resp.Usage.InputTokens,
			CompletionTokens: resp.Usage.OutputTokens,
			TotalTokens:      resp.Usage.InputTokens + resp.Usage.OutputTokens,
		}
	}
	return result
}
