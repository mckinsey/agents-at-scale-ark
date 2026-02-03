package genai

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/packages/param"
	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
)

type AnthropicProvider struct {
	Model        string
	BaseURL      string
	APIKey       string
	Headers      map[string]string
	Properties   map[string]string
	outputSchema *runtime.RawExtension
	schemaName   string
}

func (ap *AnthropicProvider) SetOutputSchema(schema *runtime.RawExtension, schemaName string) {
	ap.outputSchema = schema
	ap.schemaName = schemaName
}

// createClient creates an Anthropic SDK client with custom configuration
func (ap *AnthropicProvider) createClient(ctx context.Context) anthropic.Client {
	opts := []option.RequestOption{
		option.WithAPIKey(ap.APIKey),
	}

	// Add custom base URL if specified
	if ap.BaseURL != "" {
		baseURL := strings.TrimRight(ap.BaseURL, "/")
		// Remove /v1 if present, as the SDK will add it automatically
		baseURL = strings.TrimSuffix(baseURL, "/v1")
		opts = append(opts, option.WithBaseURL(baseURL))
	}

	// Add custom headers
	for k, v := range ap.Headers {
		opts = append(opts, option.WithHeader(k, v))
	}

	// Use custom HTTP client if in probe context
	if IsProbeContext(ctx) {
		opts = append(opts, option.WithHTTPClient(common.NewHTTPClientWithoutTracing()))
	} else {
		opts = append(opts, option.WithHTTPClient(common.NewHTTPClientWithLogging(ctx)))
	}

	return anthropic.NewClient(opts...)
}

func (ap *AnthropicProvider) HealthCheck(ctx context.Context) error {
	client := ap.createClient(ctx)

	// Make a minimal test request to verify API connectivity
	_, err := client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(ap.Model),
		MaxTokens: 1,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock("Hi")),
		},
	})

	return err
}

func (ap *AnthropicProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	client := ap.createClient(ctx)

	var toolsParam []openai.ChatCompletionToolParam
	if len(tools) > 0 {
		toolsParam = tools[0]
	}

	anthropicMessages, systemPrompt := ap.convertMessagesToAnthropic(messages)
	anthropicTools := ap.convertToolsToAnthropic(toolsParam)

	maxTokens := getIntProperty(ap.Properties, "max_tokens", 4096)
	temperature := getFloatProperty(ap.Properties, "temperature", 1.0)

	params := anthropic.MessageNewParams{
		Model:       anthropic.Model(ap.Model),
		MaxTokens:   int64(maxTokens),
		Messages:    anthropicMessages,
		Temperature: param.NewOpt(temperature),
	}

	if systemPrompt != "" {
		params.System = []anthropic.TextBlockParam{
			{Text: systemPrompt},
		}
	}

	if len(anthropicTools) > 0 {
		params.Tools = anthropicTools
	}

	response, err := client.Messages.New(ctx, params)
	if err != nil {
		return nil, err
	}

	return ap.convertAnthropicToOpenAI(response), nil
}

func (ap *AnthropicProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	client := ap.createClient(ctx)

	var toolsParam []openai.ChatCompletionToolParam
	if len(tools) > 0 {
		toolsParam = tools[0]
	}

	anthropicMessages, systemPrompt := ap.convertMessagesToAnthropic(messages)
	anthropicTools := ap.convertToolsToAnthropic(toolsParam)

	maxTokens := getIntProperty(ap.Properties, "max_tokens", 4096)
	temperature := getFloatProperty(ap.Properties, "temperature", 1.0)

	params := anthropic.MessageNewParams{
		Model:       anthropic.Model(ap.Model),
		MaxTokens:   int64(maxTokens),
		Messages:    anthropicMessages,
		Temperature: param.NewOpt(temperature),
	}

	if systemPrompt != "" {
		params.System = []anthropic.TextBlockParam{
			{Text: systemPrompt},
		}
	}

	if len(anthropicTools) > 0 {
		params.Tools = anthropicTools
	}

	stream := client.Messages.NewStreaming(ctx, params)

	var currentContent strings.Builder
	var toolCalls []openai.ChatCompletionMessageToolCall
	var messageID string
	var modelName string
	var usage openai.CompletionUsage

	message := anthropic.Message{}
	for stream.Next() {
		event := stream.Current()
		if err := message.Accumulate(event); err != nil {
			return nil, err
		}

		switch e := event.AsAny().(type) {
		case anthropic.MessageStartEvent:
			messageID = e.Message.ID
			modelName = string(e.Message.Model)
			usage.PromptTokens = int64(e.Message.Usage.InputTokens)

		case anthropic.ContentBlockStartEvent:
			if toolUse, ok := e.ContentBlock.AsAny().(anthropic.ToolUseBlock); ok {
				toolCalls = append(toolCalls, openai.ChatCompletionMessageToolCall{
					ID:   toolUse.ID,
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      toolUse.Name,
						Arguments: "",
					},
				})
			}

		case anthropic.ContentBlockDeltaEvent:
			switch delta := e.Delta.AsAny().(type) {
			case anthropic.TextDelta:
				currentContent.WriteString(delta.Text)

				chunk := &openai.ChatCompletionChunk{
					ID:     messageID,
					Object: "chat.completion.chunk",
					Model:  modelName,
					Choices: []openai.ChatCompletionChunkChoice{
						{
							Index: 0,
							Delta: openai.ChatCompletionChunkChoiceDelta{
								Content: delta.Text,
								Role:    "assistant",
							},
						},
					},
				}

				if err := streamFunc(chunk); err != nil {
					return nil, err
				}

			case anthropic.InputJSONDelta:
				if len(toolCalls) > 0 {
					toolCalls[len(toolCalls)-1].Function.Arguments += delta.PartialJSON
				}
			}

		case anthropic.MessageDeltaEvent:
			usage.CompletionTokens = int64(e.Usage.OutputTokens)
			usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
		}
	}

	if err := stream.Err(); err != nil {
		return nil, err
	}

	finishReason := "stop"
	if len(toolCalls) > 0 {
		finishReason = "tool_calls"
	}

	responseMessage := openai.ChatCompletionMessage{
		Role:    "assistant",
		Content: currentContent.String(),
	}

	if len(toolCalls) > 0 {
		responseMessage.ToolCalls = toolCalls
	}

	return &openai.ChatCompletion{
		ID:     messageID,
		Object: "chat.completion",
		Model:  modelName,
		Choices: []openai.ChatCompletionChoice{
			{
				Index:        0,
				Message:      responseMessage,
				FinishReason: finishReason,
			},
		},
		Usage: usage,
	}, nil
}

// convertMessagesToAnthropic converts OpenAI format messages to Anthropic MessageParam format
func (ap *AnthropicProvider) convertMessagesToAnthropic(messages []Message) ([]anthropic.MessageParam, string) {
	var anthropicMessages []anthropic.MessageParam
	var systemPrompt string

	for _, msg := range messages {
		openaiMsg := openai.ChatCompletionMessageParamUnion(msg)

		// Extract system prompt (Anthropic handles it separately)
		if systemMsg := openaiMsg.OfSystem; systemMsg != nil {
			if content := systemMsg.Content.OfString; content.Value != "" {
				systemPrompt = content.Value
			}
			continue
		}

		// Convert user messages
		if userMsg := openaiMsg.OfUser; userMsg != nil {
			if content := userMsg.Content.OfString; content.Value != "" {
				anthropicMessages = append(anthropicMessages, anthropic.NewUserMessage(
					anthropic.NewTextBlock(content.Value),
				))
			}
			continue
		}

		// Convert assistant messages
		if assistantMsg := openaiMsg.OfAssistant; assistantMsg != nil {
			var contentBlocks []anthropic.ContentBlockParamUnion

			// Add text content if present
			if assistantMsg.Content.OfString.Value != "" {
				contentBlocks = append(contentBlocks, anthropic.NewTextBlock(assistantMsg.Content.OfString.Value))
			}

			// Add tool use blocks
			for _, toolCall := range assistantMsg.ToolCalls {
				var input map[string]interface{}
				if toolCall.Function.Arguments != "" {
					json.Unmarshal([]byte(toolCall.Function.Arguments), &input)
				}

				contentBlocks = append(contentBlocks, anthropic.NewToolUseBlock(
					toolCall.ID,
					input,
					toolCall.Function.Name,
				))
			}

			if len(contentBlocks) > 0 {
				anthropicMessages = append(anthropicMessages, anthropic.NewAssistantMessage(contentBlocks...))
			}
			continue
		}

		// Convert tool response messages
		if toolMsg := openaiMsg.OfTool; toolMsg != nil {
			anthropicMessages = append(anthropicMessages, anthropic.NewUserMessage(
				anthropic.NewToolResultBlock(toolMsg.ToolCallID, toolMsg.Content.OfString.Value, false),
			))
		}
	}

	return anthropicMessages, systemPrompt
}

// convertToolsToAnthropic converts OpenAI format tools to Anthropic ToolUnionParam format
func (ap *AnthropicProvider) convertToolsToAnthropic(tools []openai.ChatCompletionToolParam) []anthropic.ToolUnionParam {
	var anthropicTools []anthropic.ToolUnionParam

	for _, tool := range tools {
		if tool.Type == "function" {
			toolParam := anthropic.ToolParam{
				Name: tool.Function.Name,
			}

			if tool.Function.Description.Value != "" {
				toolParam.Description = param.NewOpt(tool.Function.Description.Value)
			}

			if tool.Function.Parameters != nil {
				// Extract properties and required from the parameters map
				var properties any
				var required []string

				if props, ok := tool.Function.Parameters["properties"]; ok {
					properties = props
				}
				if req, ok := tool.Function.Parameters["required"].([]any); ok {
					for _, r := range req {
						if s, ok := r.(string); ok {
							required = append(required, s)
						}
					}
				}

				toolParam.InputSchema = anthropic.ToolInputSchemaParam{
					Type:       "object",
					Properties: properties,
					Required:   required,
				}
			}

			anthropicTools = append(anthropicTools, anthropic.ToolUnionParam{
				OfTool: &toolParam,
			})
		}
	}

	return anthropicTools
}

// convertAnthropicToOpenAI converts Anthropic Message response to OpenAI ChatCompletion format
func (ap *AnthropicProvider) convertAnthropicToOpenAI(response *anthropic.Message) *openai.ChatCompletion {
	var content string
	var toolCalls []openai.ChatCompletionMessageToolCall

	for _, block := range response.Content {
		switch b := block.AsAny().(type) {
		case anthropic.TextBlock:
			content = b.Text

		case anthropic.ToolUseBlock:
			toolCall := openai.ChatCompletionMessageToolCall{
				ID:   b.ID,
				Type: "function",
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      b.Name,
					Arguments: mustMarshalJSON(b.Input),
				},
			}
			toolCalls = append(toolCalls, toolCall)
		}
	}

	finishReason := "stop"
	switch response.StopReason {
	case "max_tokens":
		finishReason = "length"
	case "tool_use":
		finishReason = "tool_calls"
	}

	message := openai.ChatCompletionMessage{
		Role:    "assistant",
		Content: content,
	}

	if len(toolCalls) > 0 {
		message.ToolCalls = toolCalls
	}

	return &openai.ChatCompletion{
		ID:     response.ID,
		Object: "chat.completion",
		Model:  string(response.Model),
		Choices: []openai.ChatCompletionChoice{
			{
				Index:        0,
				Message:      message,
				FinishReason: finishReason,
			},
		},
		Usage: openai.CompletionUsage{
			PromptTokens:     int64(response.Usage.InputTokens),
			CompletionTokens: int64(response.Usage.OutputTokens),
			TotalTokens:      int64(response.Usage.InputTokens + response.Usage.OutputTokens),
		},
	}
}

func (ap *AnthropicProvider) BuildConfig() map[string]any {
	config := map[string]any{
		"baseUrl": ap.BaseURL,
	}
	if ap.APIKey != "" {
		config["apiKey"] = ap.APIKey
	}
	return config
}
