package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type BedrockProvider struct {
	Model          string
	Region         string
	AccessKeyID    string
	SecretAccessKey string
	SessionToken   string
	ModelArn       string
	client         *bedrockruntime.Client
}

type bedrockMessage struct {
	Role    string           `json:"role"`
	Content []bedrockContent `json:"content"`
}

type bedrockContent struct {
	Type      string         `json:"type"`
	Text      string         `json:"text,omitempty"`
	ToolUse   *bedrockToolUse   `json:"toolUse,omitempty"`
	ToolResult *bedrockToolResult `json:"toolResult,omitempty"`
}

type bedrockToolUse struct {
	ToolUseID string `json:"toolUseId"`
	Name      string `json:"name"`
	Input     any    `json:"input"`
}

type bedrockToolResult struct {
	ToolUseID string           `json:"toolUseId"`
	Content   []bedrockContent `json:"content"`
	Status    string           `json:"status,omitempty"`
}

type bedrockRequest struct {
	Messages         []bedrockMessage `json:"messages"`
	MaxTokens        int              `json:"max_tokens"`
	Temperature      float64          `json:"temperature"`
	System           string           `json:"system,omitempty"`
	AnthropicVersion string           `json:"anthropic_version,omitempty"`
	Tools            []bedrockTool    `json:"tools,omitempty"`
}

type bedrockTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

type bedrockResponse struct {
	Content    []bedrockResponseContent `json:"content"`
	ID         string                   `json:"id"`
	Model      string                   `json:"model"`
	StopReason string                   `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

type bedrockResponseContent struct {
	Type      string `json:"type"`
	Text      string `json:"text,omitempty"`
	ID        string `json:"id,omitempty"`
	Name      string `json:"name,omitempty"`
	Input     any    `json:"input,omitempty"`
}

func (bp *BedrockProvider) Turn(ctx context.Context, messages []a2aprotocol.Message, toolOutcomes []ToolOutcome, tools []ToolDefinition, _ StreamChunkHandler) (*TurnResult, error) {
	if err := bp.initClient(ctx); err != nil {
		return nil, err
	}

	bedrockMessages, systemPrompt := bp.convertMessages(messages, toolOutcomes)
	request := bedrockRequest{
		Messages:    bedrockMessages,
		MaxTokens:   4096,
		Temperature: 0.7,
		System:      systemPrompt,
	}
	if strings.Contains(strings.ToLower(bp.Model), "claude") {
		request.AnthropicVersion = "bedrock-2023-05-31"
	}
	if len(tools) > 0 {
		request.Tools = bp.convertTools(tools)
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	modelID := bp.Model
	if bp.ModelArn != "" {
		modelID = bp.ModelArn
	}
	input := &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String(modelID),
		Body:        requestBody,
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
	}

	result, err := bp.client.InvokeModel(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to invoke Bedrock model: %w", err)
	}

	var response bedrockResponse
	if err := json.Unmarshal(result.Body, &response); err != nil {
		return nil, err
	}
	return bp.convertResponse(response), nil
}

func (bp *BedrockProvider) initClient(ctx context.Context) error {
	if bp.client != nil {
		return nil
	}

	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(bp.Region),
	}
	if bp.AccessKeyID != "" && bp.SecretAccessKey != "" {
		opts = append(opts, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(bp.AccessKeyID, bp.SecretAccessKey, bp.SessionToken),
		))
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx, opts...)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}
	bp.client = bedrockruntime.NewFromConfig(cfg)
	return nil
}

func (bp *BedrockProvider) convertMessages(messages []a2aprotocol.Message, toolOutcomes []ToolOutcome) ([]bedrockMessage, string) {
	var systemPrompt string
	var result []bedrockMessage

	outcomeByID := make(map[string]ToolOutcome)
	for _, o := range toolOutcomes {
		outcomeByID[o.ToolCallID] = o
	}

	for _, msg := range messages {
		role := resolveRole(msg)
		text := extractText(msg)

		switch role {
		case "system":
			systemPrompt = text
		case "user":
			result = append(result, bedrockMessage{
				Role:    "user",
				Content: []bedrockContent{{Type: "text", Text: text}},
			})
		case "assistant":
			content := []bedrockContent{}
			if text != "" {
				content = append(content, bedrockContent{Type: "text", Text: text})
			}
			toolCalls := extractToolCalls(msg)
			for _, tc := range toolCalls {
				var inputData any
				if tc.Arguments != "" {
					json.Unmarshal([]byte(tc.Arguments), &inputData)
				}
				if inputData == nil {
					inputData = map[string]any{}
				}
				content = append(content, bedrockContent{
					Type: "tool_use",
					ToolUse: &bedrockToolUse{
						ToolUseID: tc.ID,
						Name:      tc.Name,
						Input:     inputData,
					},
				})
			}
			if len(content) > 0 {
				result = append(result, bedrockMessage{Role: "assistant", Content: content})
			}
		case "tool":
			toolCallID := extractToolCallID(msg)
			if o, ok := outcomeByID[toolCallID]; ok {
				result = append(result, bedrockMessage{
					Role: "user",
					Content: []bedrockContent{{
						Type: "tool_result",
						ToolResult: &bedrockToolResult{
							ToolUseID: o.ToolCallID,
							Content:   []bedrockContent{{Type: "text", Text: o.Content}},
						},
					}},
				})
				delete(outcomeByID, toolCallID)
			}
		}
	}

	for _, o := range outcomeByID {
		result = append(result, bedrockMessage{
			Role: "user",
			Content: []bedrockContent{{
				Type: "tool_result",
				ToolResult: &bedrockToolResult{
					ToolUseID: o.ToolCallID,
					Content:   []bedrockContent{{Type: "text", Text: o.Content}},
				},
			}},
		})
	}

	return result, systemPrompt
}

func (bp *BedrockProvider) convertTools(tools []ToolDefinition) []bedrockTool {
	result := make([]bedrockTool, len(tools))
	for i, t := range tools {
		schema := t.Parameters
		if schema == nil {
			schema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		result[i] = bedrockTool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: schema,
		}
	}
	return result
}

func (bp *BedrockProvider) convertResponse(response bedrockResponse) *TurnResult {
	var content string
	var toolCalls []ToolCall

	for _, c := range response.Content {
		switch c.Type {
		case "text":
			content += c.Text
		case "tool_use":
			args := "{}"
			if c.Input != nil {
				if data, err := json.Marshal(c.Input); err == nil {
					args = string(data)
				}
			}
			toolCalls = append(toolCalls, ToolCall{
				ID:        c.ID,
				Name:      c.Name,
				Arguments: args,
			})
		}
	}

	parts := []a2aprotocol.Part{a2aprotocol.NewTextPart(content)}
	if len(toolCalls) > 0 {
		calls := make([]map[string]any, len(toolCalls))
		for i, tc := range toolCalls {
			calls[i] = map[string]any{
				"id":        tc.ID,
				"name":      tc.Name,
				"arguments": tc.Arguments,
			}
		}
		parts = append(parts, &a2aprotocol.DataPart{
			Kind: a2aprotocol.KindData,
			Data: map[string]any{
				"schema":    "https://ark.mckinsey.com/payloads/tool-calls/v1",
				"toolCalls": calls,
			},
		})
	}

	a2aMsg := a2aprotocol.NewMessage(a2aprotocol.MessageRoleAgent, parts)

	return &TurnResult{
		Message:   a2aMsg,
		ToolCalls: toolCalls,
		Content:   content,
		Usage: &TurnUsage{
			PromptTokens:     int64(response.Usage.InputTokens),
			CompletionTokens: int64(response.Usage.OutputTokens),
			TotalTokens:      int64(response.Usage.InputTokens + response.Usage.OutputTokens),
		},
	}
}
