package completions

import (
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertMessagesToAnthropic(t *testing.T) {
	t.Run("extracts system prompt", func(t *testing.T) {
		messages := []Message{
			NewSystemMessage("You are helpful"),
			NewUserMessage("Hello"),
		}
		result, systemPrompt := convertMessagesToAnthropic(messages)
		assert.Equal(t, "You are helpful", systemPrompt)
		require.Len(t, result, 1)
		assert.Equal(t, "user", result[0].Role)
		assert.Equal(t, "Hello", result[0].Content)
	})

	t.Run("converts user and assistant messages", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("Hi"),
			NewAssistantMessage("Hello!"),
			NewUserMessage("How are you?"),
		}
		result, systemPrompt := convertMessagesToAnthropic(messages)
		assert.Empty(t, systemPrompt)
		require.Len(t, result, 3)
		assert.Equal(t, "user", result[0].Role)
		assert.Equal(t, "assistant", result[1].Role)
		assert.Equal(t, "user", result[2].Role)
	})

	t.Run("skips empty messages", func(t *testing.T) {
		messages := []Message{
			NewUserMessage(""),
			NewUserMessage("hello"),
		}
		result, _ := convertMessagesToAnthropic(messages)
		require.Len(t, result, 1)
		assert.Equal(t, "hello", result[0].Content)
	})
}

func TestConvertAnthropicResponse(t *testing.T) {
	t.Run("converts text response", func(t *testing.T) {
		response := anthropicResponse{
			ID:         "msg_123",
			Model:      "claude-sonnet-4-20250514",
			StopReason: "end_turn",
			Content: []anthropicContent{
				{Type: "text", Text: "Hello!"},
			},
			Usage: struct {
				InputTokens  int `json:"input_tokens"`
				OutputTokens int `json:"output_tokens"`
			}{InputTokens: 10, OutputTokens: 5},
		}

		result := convertAnthropicResponse(response)
		assert.Equal(t, "msg_123", result.ID)
		assert.Contains(t, result.Object, "chat.completion")
		require.Len(t, result.Choices, 1)
		assert.Equal(t, "Hello!", result.Choices[0].Message.Content)
		assert.Contains(t, result.Choices[0].FinishReason, "stop")
		assert.Equal(t, int64(10), result.Usage.PromptTokens)
		assert.Equal(t, int64(5), result.Usage.CompletionTokens)
		assert.Equal(t, int64(15), result.Usage.TotalTokens)
	})

	t.Run("converts tool_use response", func(t *testing.T) {
		response := anthropicResponse{
			ID:         "msg_456",
			Model:      "claude-sonnet-4-20250514",
			StopReason: "tool_use",
			Content: []anthropicContent{
				{Type: "text", Text: "Let me search for that."},
				{Type: "tool_use", ID: "call_1", Name: "search", Input: map[string]interface{}{"query": "test"}},
			},
		}

		result := convertAnthropicResponse(response)
		assert.Contains(t, result.Choices[0].FinishReason, "tool_calls")
		assert.Equal(t, "Let me search for that.", result.Choices[0].Message.Content)
		require.Len(t, result.Choices[0].Message.ToolCalls, 1)
		assert.Equal(t, "call_1", result.Choices[0].Message.ToolCalls[0].ID)
		assert.Equal(t, "search", result.Choices[0].Message.ToolCalls[0].Function.Name)
		assert.Contains(t, result.Choices[0].Message.ToolCalls[0].Type, "function")
	})

	t.Run("maps max_tokens to length", func(t *testing.T) {
		response := anthropicResponse{
			StopReason: "max_tokens",
			Content:    []anthropicContent{{Type: "text", Text: "truncated"}},
		}
		result := convertAnthropicResponse(response)
		assert.Contains(t, result.Choices[0].FinishReason, "length")
	})
}

func TestConvertToolsToAnthropic(t *testing.T) {
	t.Run("converts function tools", func(t *testing.T) {
		tools := []openai.ChatCompletionToolParam{
			{
				Type: "function",
				Function: openai.FunctionDefinitionParam{
					Name:        "search",
					Description: openai.String("Search the web"),
					Parameters:  map[string]interface{}{"type": "object", "properties": map[string]interface{}{"query": map[string]interface{}{"type": "string"}}},
				},
			},
		}

		result := convertToolsToAnthropic(tools)
		require.Len(t, result, 1)
		assert.Equal(t, "search", result[0].Name)
		assert.Equal(t, "Search the web", result[0].Description)
		assert.NotNil(t, result[0].InputSchema)
	})

	t.Run("skips non-function tools", func(t *testing.T) {
		tools := []openai.ChatCompletionToolParam{
			{Type: "other"},
		}
		result := convertToolsToAnthropic(tools)
		assert.Empty(t, result)
	})
}

func TestBuildAnthropicRequest(t *testing.T) {
	messages := []anthropicMessage{{Role: "user", Content: "Hi"}}
	tools := []anthropicTool{{Name: "test", Description: "test tool"}}

	t.Run("uses defaults", func(t *testing.T) {
		req := buildAnthropicRequest(messages, "system", tools, nil)
		assert.Equal(t, 4096, req.MaxTokens)
		assert.Equal(t, 1.0, req.Temperature)
		assert.Equal(t, "system", req.SystemPrompt)
		assert.Len(t, req.Messages, 1)
		assert.Len(t, req.Tools, 1)
	})

	t.Run("uses properties", func(t *testing.T) {
		props := map[string]string{"temperature": "0.5", "max_tokens": "1024"}
		req := buildAnthropicRequest(messages, "", tools, props)
		assert.Equal(t, 1024, req.MaxTokens)
		assert.Equal(t, 0.5, req.Temperature)
	})
}

func TestExtractMessageContent(t *testing.T) {
	t.Run("extracts system message", func(t *testing.T) {
		content, role := extractMessageContent(NewSystemMessage("system prompt"))
		assert.Equal(t, "system prompt", content)
		assert.Equal(t, "system", role)
	})

	t.Run("extracts user message", func(t *testing.T) {
		content, role := extractMessageContent(NewUserMessage("hello"))
		assert.Equal(t, "hello", content)
		assert.Equal(t, "user", role)
	})

	t.Run("extracts assistant message", func(t *testing.T) {
		content, role := extractMessageContent(NewAssistantMessage("response"))
		assert.Equal(t, "response", content)
		assert.Equal(t, "assistant", role)
	})
}
