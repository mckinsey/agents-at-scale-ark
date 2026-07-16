package completions

import (
	"encoding/json"

	"github.com/openai/openai-go"
)

func extractMessageContent(msg Message) (string, string) {
	openaiMsg := openai.ChatCompletionMessageParamUnion(msg)

	if systemMsg := openaiMsg.OfSystem; systemMsg != nil {
		if content := systemMsg.Content.OfString; content.Value != "" {
			return content.Value, RoleSystem
		}
	}

	if userMsg := openaiMsg.OfUser; userMsg != nil {
		if content := userMsg.Content.OfString; content.Value != "" {
			return content.Value, RoleUser
		}
	}

	if assistantMsg := openaiMsg.OfAssistant; assistantMsg != nil {
		if content := assistantMsg.Content.OfString; content.Value != "" {
			return content.Value, RoleAssistant
		}
	}

	if toolMsg := openaiMsg.OfTool; toolMsg != nil {
		if content := toolMsg.Content.OfString; content.Value != "" {
			return content.Value, RoleTool
		}
	}

	return "", ""
}

type anthropicCacheControl struct {
	Type string `json:"type"`
}

type anthropicSystemBlock struct {
	Type         string                 `json:"type"`
	Text         string                 `json:"text"`
	CacheControl *anthropicCacheControl `json:"cache_control,omitempty"`
}

type anthropicMessageContent struct {
	Type         string                 `json:"type"`
	Text         string                 `json:"text"`
	CacheControl *anthropicCacheControl `json:"cache_control,omitempty"`
}

type anthropicMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

type anthropicRequest struct {
	Messages         []anthropicMessage     `json:"messages"`
	MaxTokens        int                    `json:"max_tokens"`
	Temperature      float64                `json:"temperature"`
	SystemPrompt     []anthropicSystemBlock `json:"system,omitempty"`
	AnthropicVersion string                 `json:"anthropic_version,omitempty"`
	Tools            []anthropicTool        `json:"tools,omitempty"`
	ToolChoice       map[string]interface{} `json:"tool_choice,omitempty"`
	Model            string                 `json:"model,omitempty"`
}

type anthropicTool struct {
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	InputSchema  map[string]interface{} `json:"input_schema"`
	CacheControl *anthropicCacheControl `json:"cache_control,omitempty"`
}

type anthropicResponse struct {
	Content    []anthropicContent `json:"content"`
	ID         string             `json:"id"`
	Model      string             `json:"model"`
	StopReason string             `json:"stop_reason"`
	Usage      struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
}

type anthropicContent struct {
	Text  string                 `json:"text,omitempty"`
	Type  string                 `json:"type"`
	ID    string                 `json:"id,omitempty"`
	Name  string                 `json:"name,omitempty"`
	Input map[string]interface{} `json:"input,omitempty"`
}

func convertMessagesToAnthropic(messages []Message) ([]anthropicMessage, []anthropicSystemBlock) {
	type collectedMessage struct {
		role string
		text string
	}

	var collected []collectedMessage
	var systemBlocks []anthropicSystemBlock

	for _, msg := range messages {
		content, role := extractMessageContent(msg)
		if content == "" {
			continue
		}

		switch role {
		case RoleSystem:
			systemBlocks = []anthropicSystemBlock{
				{
					Type:         "text",
					Text:         content,
					CacheControl: &anthropicCacheControl{Type: "ephemeral"},
				},
			}
		case RoleUser, RoleAssistant, RoleTool:
			msgRole := role
			if role == RoleTool {
				msgRole = RoleUser
			}
			collected = append(collected, collectedMessage{role: msgRole, text: content})
		}
	}

	cacheIndex := -1
	if len(collected) >= 2 {
		cacheIndex = len(collected) - 2
	}

	result := make([]anthropicMessage, len(collected))
	for i, m := range collected {
		if i == cacheIndex {
			block := []anthropicMessageContent{
				{
					Type:         "text",
					Text:         m.text,
					CacheControl: &anthropicCacheControl{Type: "ephemeral"},
				},
			}
			result[i] = anthropicMessage{Role: m.role, Content: mustMarshalRaw(block)}
		} else {
			result[i] = anthropicMessage{Role: m.role, Content: mustMarshalRaw(m.text)}
		}
	}

	return result, systemBlocks
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
		Role:    RoleAssistant,
		Content: content,
	}

	if len(toolCalls) > 0 {
		message.ToolCalls = toolCalls
	}

	promptTokens := int64(response.Usage.InputTokens +
		response.Usage.CacheCreationInputTokens +
		response.Usage.CacheReadInputTokens)

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
			PromptTokens:     promptTokens,
			CompletionTokens: int64(response.Usage.OutputTokens),
			TotalTokens:      promptTokens + int64(response.Usage.OutputTokens),
			PromptTokensDetails: openai.CompletionUsagePromptTokensDetails{
				CachedTokens: int64(response.Usage.CacheReadInputTokens),
			},
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

	if len(result) > 0 {
		result[len(result)-1].CacheControl = &anthropicCacheControl{Type: "ephemeral"}
	}

	return result
}

func buildAnthropicRequest(messages []anthropicMessage, systemPrompt []anthropicSystemBlock, tools []anthropicTool, toolChoice ToolChoice, properties map[string]string) anthropicRequest {
	temperature := getFloatProperty(properties, "temperature", 1.0)
	maxTokens := getIntProperty(properties, "max_tokens", 4096)

	return anthropicRequest{
		Messages:     messages,
		MaxTokens:    maxTokens,
		Temperature:  temperature,
		SystemPrompt: systemPrompt,
		Tools:        tools,
		ToolChoice:   anthropicToolChoice(toolChoice),
	}
}

func anthropicToolChoice(toolChoice ToolChoice) map[string]interface{} {
	switch toolChoice {
	case ToolChoiceRequired:
		return map[string]interface{}{"type": "any"}
	case ToolChoiceAuto:
		return map[string]interface{}{"type": "auto"}
	case ToolChoiceNone:
		return map[string]interface{}{"type": "none"}
	default:
		return nil
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
						Role:    RoleAssistant,
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

func mustMarshalRaw(v interface{}) json.RawMessage {
	data, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`""`)
	}
	return json.RawMessage(data)
}
