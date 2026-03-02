package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

type GeminiContent struct {
	Role  string       `json:"role"`
	Parts []GeminiPart `json:"parts"`
}

type GeminiPart struct {
	Text         string              `json:"text,omitempty"`
	FunctionCall *GeminiFunctionCall `json:"functionCall,omitempty"`
	FunctionResponse *GeminiFunctionResponse `json:"functionResponse,omitempty"`
}

type GeminiFunctionCall struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args"`
}

type GeminiFunctionResponse struct {
	Name     string         `json:"name"`
	Response map[string]any `json:"response"`
}

type GeminiToolDeclaration struct {
	FunctionDeclarations []GeminiFunctionDeclaration `json:"functionDeclarations"`
}

type GeminiFunctionDeclaration struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

type GeminiGenerateRequest struct {
	Contents []GeminiContent         `json:"contents"`
	Tools    []GeminiToolDeclaration `json:"tools,omitempty"`
}

type GeminiGenerateResponse struct {
	Candidates []GeminiCandidate  `json:"candidates"`
	UsageMetadata *GeminiUsage    `json:"usageMetadata,omitempty"`
}

type GeminiCandidate struct {
	Content GeminiContent `json:"content"`
}

type GeminiUsage struct {
	PromptTokenCount     int64 `json:"promptTokenCount"`
	CandidatesTokenCount int64 `json:"candidatesTokenCount"`
	TotalTokenCount      int64 `json:"totalTokenCount"`
}

type GeminiContentProvider interface {
	GenerateContent(ctx context.Context, req GeminiGenerateRequest) (*GeminiGenerateResponse, error)
}

type geminiA2AModelAdapter struct {
	provider          GeminiContentProvider
	modelName         string
	agentName         string
	telemetryRecorder telemetry.ModelRecorder
	eventingRecorder  eventing.ModelRecorder
}

func NewGeminiA2AModelAdapter(provider GeminiContentProvider, modelName, agentName string, telemetryRecorder telemetry.ModelRecorder, eventingRecorder eventing.ModelRecorder) A2AModelProvider {
	return &geminiA2AModelAdapter{
		provider:          provider,
		modelName:         modelName,
		agentName:         agentName,
		telemetryRecorder: telemetryRecorder,
		eventingRecorder:  eventingRecorder,
	}
}

func (a *geminiA2AModelAdapter) A2ATurn(ctx context.Context, messages []protocol.Message, toolOutcomes []A2AToolOutcome, tools []A2AToolDefinition, _ EventStreamInterface) (*A2ATurnResult, error) {
	ctx, span := a.telemetryRecorder.StartModelExecution(ctx, a.modelName, "gemini")
	defer span.End()

	operationData := map[string]string{"model": a.modelName, "modelType": "gemini"}
	ctx = a.eventingRecorder.Start(ctx, "LLMCall", fmt.Sprintf("Calling Gemini model %s", a.modelName), operationData)

	contents := convertA2AToGeminiContents(messages, toolOutcomes)
	geminiTools := convertA2AToolsToGeminiTools(tools)

	req := GeminiGenerateRequest{
		Contents: contents,
		Tools:    geminiTools,
	}

	resp, err := a.provider.GenerateContent(ctx, req)
	if err != nil {
		a.telemetryRecorder.RecordError(span, err)
		a.eventingRecorder.Fail(ctx, "LLMCall", fmt.Sprintf("Gemini call failed: %v", err), err, operationData)
		return nil, err
	}
	if len(resp.Candidates) == 0 {
		emptyErr := fmt.Errorf("gemini returned no candidates")
		a.telemetryRecorder.RecordError(span, emptyErr)
		a.eventingRecorder.Fail(ctx, "LLMCall", "Gemini returned no candidates", emptyErr, operationData)
		return nil, emptyErr
	}

	result := convertGeminiResponseToA2ATurnResult(resp)
	a.telemetryRecorder.RecordSuccess(span)
	a.eventingRecorder.Complete(ctx, "LLMCall", "Gemini call completed successfully", operationData)
	if resp.UsageMetadata != nil {
		a.telemetryRecorder.RecordTokenUsage(span, resp.UsageMetadata.PromptTokenCount, resp.UsageMetadata.CandidatesTokenCount, resp.UsageMetadata.TotalTokenCount)
	}

	return result, nil
}

func convertA2AToGeminiContents(messages []protocol.Message, toolOutcomes []A2AToolOutcome) []GeminiContent {
	result := make([]GeminiContent, 0, len(messages)+1)
	for _, msg := range messages {
		role := "user"
		if msg.Role == protocol.MessageRoleAgent {
			role = "model"
		}
		parts := make([]GeminiPart, 0, len(msg.Parts))
		for _, part := range msg.Parts {
			switch p := part.(type) {
			case protocol.TextPart:
				parts = append(parts, GeminiPart{Text: p.Text})
			case *protocol.TextPart:
				parts = append(parts, GeminiPart{Text: p.Text})
			}
		}
		if len(parts) == 0 {
			parts = append(parts, GeminiPart{Text: "."})
		}
		result = append(result, GeminiContent{Role: role, Parts: parts})
	}
	if len(toolOutcomes) > 0 {
		parts := make([]GeminiPart, 0, len(toolOutcomes))
		for _, outcome := range toolOutcomes {
			content := outcome.Content
			if content == "" {
				content = outcome.Error
			}
			if content == "" {
				content = "{}"
			}
			parts = append(parts, GeminiPart{
				FunctionResponse: &GeminiFunctionResponse{
					Name:     outcome.ToolName,
					Response: map[string]any{"result": content},
				},
			})
		}
		result = append(result, GeminiContent{Role: "function", Parts: parts})
	}
	return result
}

func convertA2AToolsToGeminiTools(tools []A2AToolDefinition) []GeminiToolDeclaration {
	if len(tools) == 0 {
		return nil
	}
	decls := make([]GeminiFunctionDeclaration, len(tools))
	for i, tool := range tools {
		decls[i] = GeminiFunctionDeclaration{
			Name:        tool.Name,
			Description: tool.Description,
			Parameters:  tool.Parameters,
		}
	}
	return []GeminiToolDeclaration{{FunctionDeclarations: decls}}
}

func convertGeminiResponseToA2ATurnResult(resp *GeminiGenerateResponse) *A2ATurnResult {
	candidate := resp.Candidates[0]
	var text string
	var toolCalls []A2AToolCall

	for _, part := range candidate.Content.Parts {
		if part.Text != "" {
			text += part.Text
		}
		if part.FunctionCall != nil {
			tc := A2AToolCall{
				ID:        fmt.Sprintf("gemini-%s", part.FunctionCall.Name),
				Name:      part.FunctionCall.Name,
				Arguments: "{}",
			}
			if part.FunctionCall.Args != nil {
				if raw, err := marshalJSON(part.FunctionCall.Args); err == nil {
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
	if resp.UsageMetadata != nil {
		result.Usage = &A2ATurnUsage{
			PromptTokens:     resp.UsageMetadata.PromptTokenCount,
			CompletionTokens: resp.UsageMetadata.CandidatesTokenCount,
			TotalTokens:      resp.UsageMetadata.TotalTokenCount,
		}
	}
	return result
}
