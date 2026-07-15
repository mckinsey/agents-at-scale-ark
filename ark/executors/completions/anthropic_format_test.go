package completions

import (
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertMessagesToAnthropic(t *testing.T) {
	t.Run("extracts system prompt as cached block", func(t *testing.T) {
		messages := []Message{
			NewSystemMessage("You are helpful"),
			NewUserMessage("Hello"),
		}
		result, systemBlocks := convertMessagesToAnthropic(messages)
		require.Len(t, systemBlocks, 1)
		assert.Equal(t, "text", systemBlocks[0].Type)
		assert.Equal(t, "You are helpful", systemBlocks[0].Text)
		require.NotNil(t, systemBlocks[0].CacheControl)
		assert.Equal(t, "ephemeral", systemBlocks[0].CacheControl.Type)
		require.Len(t, result, 1)
		assert.Equal(t, "user", result[0].Role)
		assert.Equal(t, json.RawMessage(`"Hello"`), result[0].Content)
	})

	t.Run("converts user and assistant messages", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("Hi"),
			NewAssistantMessage("Hello!"),
			NewUserMessage("How are you?"),
		}
		result, systemBlocks := convertMessagesToAnthropic(messages)
		assert.Empty(t, systemBlocks)
		require.Len(t, result, 3)
		assert.Equal(t, "user", result[0].Role)
		assert.Equal(t, "assistant", result[1].Role)
		assert.Equal(t, "user", result[2].Role)
	})

	t.Run("marks penultimate message with cache_control", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("Hi"),
			NewAssistantMessage("Hello!"),
			NewUserMessage("How are you?"),
		}
		result, _ := convertMessagesToAnthropic(messages)
		require.Len(t, result, 3)

		var blocks []anthropicMessageContent
		require.NoError(t, json.Unmarshal(result[1].Content, &blocks))
		require.Len(t, blocks, 1)
		assert.Equal(t, "Hello!", blocks[0].Text)
		require.NotNil(t, blocks[0].CacheControl)
		assert.Equal(t, "ephemeral", blocks[0].CacheControl.Type)

		assert.Equal(t, json.RawMessage(`"How are you?"`), result[2].Content)
	})

	t.Run("no cache breakpoint with single message", func(t *testing.T) {
		messages := []Message{NewUserMessage("only one")}
		result, _ := convertMessagesToAnthropic(messages)
		require.Len(t, result, 1)
		assert.Equal(t, json.RawMessage(`"only one"`), result[0].Content)
	})

	t.Run("skips empty messages", func(t *testing.T) {
		messages := []Message{
			NewUserMessage(""),
			NewUserMessage("hello"),
		}
		result, _ := convertMessagesToAnthropic(messages)
		require.Len(t, result, 1)
		assert.Equal(t, json.RawMessage(`"hello"`), result[0].Content)
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
				InputTokens              int `json:"input_tokens"`
				OutputTokens             int `json:"output_tokens"`
				CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
				CacheReadInputTokens     int `json:"cache_read_input_tokens"`
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

	t.Run("folds cache tokens into prompt and total", func(t *testing.T) {
		response := anthropicResponse{
			ID:         "msg_cache",
			StopReason: "end_turn",
			Content:    []anthropicContent{{Type: "text", Text: "Hi"}},
			Usage: struct {
				InputTokens              int `json:"input_tokens"`
				OutputTokens             int `json:"output_tokens"`
				CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
				CacheReadInputTokens     int `json:"cache_read_input_tokens"`
			}{InputTokens: 10, OutputTokens: 5, CacheCreationInputTokens: 100, CacheReadInputTokens: 200},
		}

		result := convertAnthropicResponse(response)
		assert.Equal(t, int64(310), result.Usage.PromptTokens)
		assert.Equal(t, int64(5), result.Usage.CompletionTokens)
		assert.Equal(t, int64(315), result.Usage.TotalTokens)
		assert.Equal(t, int64(200), result.Usage.PromptTokensDetails.CachedTokens)
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

	t.Run("marks last tool with cache_control", func(t *testing.T) {
		tools := []openai.ChatCompletionToolParam{
			{Type: "function", Function: openai.FunctionDefinitionParam{Name: "first"}},
			{Type: "function", Function: openai.FunctionDefinitionParam{Name: "last"}},
		}
		result := convertToolsToAnthropic(tools)
		require.Len(t, result, 2)
		assert.Nil(t, result[0].CacheControl)
		require.NotNil(t, result[1].CacheControl)
		assert.Equal(t, "ephemeral", result[1].CacheControl.Type)
	})

	t.Run("no panic on nil tools", func(t *testing.T) {
		result := convertToolsToAnthropic(nil)
		assert.Empty(t, result)
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
	messages := []anthropicMessage{{Role: "user", Content: json.RawMessage(`"Hi"`)}}
	tools := []anthropicTool{{Name: "test", Description: "test tool"}}
	system := []anthropicSystemBlock{{Type: "text", Text: "system"}}

	t.Run("uses defaults", func(t *testing.T) {
		req := buildAnthropicRequest(messages, system, tools, ToolChoiceUnset, nil)
		assert.Equal(t, 4096, req.MaxTokens)
		assert.Equal(t, 1.0, req.Temperature)
		require.Len(t, req.SystemPrompt, 1)
		assert.Equal(t, "system", req.SystemPrompt[0].Text)
		assert.Len(t, req.Messages, 1)
		assert.Len(t, req.Tools, 1)
		assert.Nil(t, req.ToolChoice)
	})

	t.Run("uses properties", func(t *testing.T) {
		props := map[string]string{"temperature": "0.5", "max_tokens": "1024"}
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceUnset, props)
		assert.Equal(t, 1024, req.MaxTokens)
		assert.Equal(t, 0.5, req.Temperature)
	})

	t.Run("required tool choice maps to type=any", func(t *testing.T) {
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceRequired, nil)
		assert.Equal(t, map[string]interface{}{"type": "any"}, req.ToolChoice)
	})

	t.Run("auto and none tool choice map through", func(t *testing.T) {
		auto := buildAnthropicRequest(messages, nil, tools, ToolChoiceAuto, nil)
		assert.Equal(t, map[string]interface{}{"type": "auto"}, auto.ToolChoice)
		none := buildAnthropicRequest(messages, nil, tools, ToolChoiceNone, nil)
		assert.Equal(t, map[string]interface{}{"type": "none"}, none.ToolChoice)
	})

	t.Run("tool_choice is omitted from JSON when unset", func(t *testing.T) {
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceUnset, nil)
		body, err := json.Marshal(req)
		require.NoError(t, err)
		assert.NotContains(t, string(body), "tool_choice")
	})

	t.Run("tool_choice is serialized when set", func(t *testing.T) {
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceRequired, nil)
		body, err := json.Marshal(req)
		require.NoError(t, err)
		assert.Contains(t, string(body), `"tool_choice":{"type":"any"}`)
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
