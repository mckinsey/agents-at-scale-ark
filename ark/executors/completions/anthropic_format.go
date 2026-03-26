package completions

import (
	"encoding/json"

	"github.com/openai/openai-go"
)

func extractMessageContent(msg Message) (string, string) {
	openaiMsg := openai.ChatCompletionMessageParamUnion(msg)

	if systemMsg := openaiMsg.OfSystem; systemMsg != nil {
		if content := systemMsg.Content.OfString; content.Value != "" {
			return content.Value, "system"
		}
	}

	if userMsg := openaiMsg.OfUser; userMsg != nil {
		if content := userMsg.Content.OfString; content.Value != "" {
			return content.Value, RoleUser
		}
	}

	if assistantMsg := openaiMsg.OfAssistant; assistantMsg != nil {
		if content := assistantMsg.Content.OfString; content.Value != "" {
			return content.Value, "assistant"
		}
	}

	if toolMsg := openaiMsg.OfTool; toolMsg != nil {
		if content := toolMsg.Content.OfString; content.Value != "" {
			return content.Value, "tool"
		}
	}

	return "", ""
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequest struct {
	Messages         []anthropicMessage `json:"messages"`
	MaxTokens        int                `json:"max_tokens"`
	Temperature      float64            `json:"temperature"`
	SystemPrompt     string             `json:"system,omitempty"`
	AnthropicVersion string             `json:"anthropic_version,omitempty"`
	Tools            []anthropicTool    `json:"tools,omitempty"`
	Model            string             `json:"model,omitempty"`
}

type anthropicTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"input_schema"`
}

type anthropicResponse struct {
	Content    []anthropicContent `json:"content"`
	ID         string             `json:"id"`
	Model      string             `json:"model"`
	StopReason string             `json:"stop_reason"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

type anthropicContent struct {
	Text  string                 `json:"text,omitempty"`
	Type  string                 `json:"type"`
	ID    string                 `json:"id,omitempty"`
	Name  string                 `json:"name,omitempty"`
	Input map[string]interface{} `json:"input,omitempty"`
}

func convertMessagesToAnthropic(messages []Message) ([]anthropicMessage, string) {
	var result []anthropicMessage
	var systemPrompt string

	for _, msg := range messages {
		content, role := extractMessageContent(msg)
		if content == "" {
			continue
		}

		switch role {
		case RoleSystem:
			systemPrompt = content
		case RoleUser, RoleAssistant, RoleTool:
			msgRole := role
			if role == RoleTool {
				msgRole = RoleUser
			}
			result = append(result, anthropicMessage{
				Role:    msgRole,
				Content: content,
			})
		}
	}

	return result, systemPrompt
}

func convertAnthropicResponse(response anthropicResponse) *openai.ChatCompletion {
	var content string
	var toolCalls []openai.ChatCompletionMessageToolCall

	for _, c := range response.Content {
		switch c.Type {
		case "text":
			content = c.Text
		case "tool_use":
			toolCall := openai.ChatCompletionMessageToolCall{
				ID:   c.ID,
				Type: "function",
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      c.Name,
					Arguments: mustMarshalJSON(c.Input),
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
		Model:  response.Model,
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

func convertToolsToAnthropic(tools []openai.ChatCompletionToolParam) []anthropicTool {
	var result []anthropicTool

	for _, tool := range tools {
		if tool.Type == "function" {
			t := anthropicTool{
				Name: tool.Function.Name,
			}

			if tool.Function.Description.Value != "" {
				t.Description = tool.Function.Description.Value
			}

			if tool.Function.Parameters != nil {
				t.InputSchema = map[string]interface{}(tool.Function.Parameters)
			}

			result = append(result, t)
		}
	}

	return result
}

func buildAnthropicRequest(messages []anthropicMessage, systemPrompt string, tools []anthropicTool, properties map[string]string) anthropicRequest {
	temperature := getFloatProperty(properties, "temperature", 1.0)
	maxTokens := getIntProperty(properties, "max_tokens", 4096)

	return anthropicRequest{
		Messages:     messages,
		MaxTokens:    maxTokens,
		Temperature:  temperature,
		SystemPrompt: systemPrompt,
		Tools:        tools,
	}
}

func streamCompletionAsChunks(completion *openai.ChatCompletion, streamFunc func(*openai.ChatCompletionChunk) error) error {
	for _, choice := range completion.Choices {
		chunk := &openai.ChatCompletionChunk{
			ID:      completion.ID,
			Object:  "chat.completion.chunk",
			Created: completion.Created,
			Model:   completion.Model,
			Choices: []openai.ChatCompletionChunkChoice{
				{
					Index: choice.Index,
					Delta: openai.ChatCompletionChunkChoiceDelta{
						Content: choice.Message.Content,
						Role:    "assistant",
					},
					FinishReason: choice.FinishReason,
				},
			},
		}

		if err := streamFunc(chunk); err != nil {
			return err
		}
	}
	return nil
}

func mustMarshalJSON(v interface{}) string {
	if v == nil {
		return "{}"
	}
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(data)
}
