package genai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/openai/openai-go"
	openaiParam "github.com/openai/openai-go/packages/param"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAnthropicMockServer(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *AnthropicProvider) {
	t.Helper()
	server := httptest.NewServer(handler)

	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: server.URL,
		APIKey:  "test-api-key",
		Properties: map[string]string{
			"max_tokens":  "1024",
			"temperature": "0.7",
		},
	}

	return server, provider
}

func TestAnthropicProvider_ChatCompletion_SimpleMessage(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/messages", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "test-api-key", r.Header.Get("x-api-key"))
		assert.Equal(t, "2023-06-01", r.Header.Get("anthropic-version"))

		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		assert.Equal(t, "claude-3-haiku-20240307", reqBody["model"])
		assert.Equal(t, float64(1024), reqBody["max_tokens"])

		response := map[string]interface{}{
			"id":            "msg_test123",
			"type":          "message",
			"role":          "assistant",
			"model":         "claude-3-haiku-20240307",
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "Hello! How can I help you today?",
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 20,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	messages := []Message{
		NewUserMessage("Hello"),
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1)
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.Equal(t, "msg_test123", result.ID)
	assert.Equal(t, "chat.completion", string(result.Object))
	assert.Equal(t, "claude-3-haiku-20240307", result.Model)
	assert.Len(t, result.Choices, 1)
	assert.Equal(t, "Hello! How can I help you today?", result.Choices[0].Message.Content)
	assert.Equal(t, "stop", result.Choices[0].FinishReason)
	assert.Equal(t, int64(10), result.Usage.PromptTokens)
	assert.Equal(t, int64(20), result.Usage.CompletionTokens)
	assert.Equal(t, int64(30), result.Usage.TotalTokens)
}

func TestAnthropicProvider_ChatCompletion_WithSystemPrompt(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		system, ok := reqBody["system"].([]interface{})
		assert.True(t, ok, "system field should be present")
		assert.Len(t, system, 1)
		systemBlock := system[0].(map[string]interface{})
		assert.Equal(t, "text", systemBlock["type"])
		assert.Equal(t, "You are a helpful assistant", systemBlock["text"])

		response := map[string]interface{}{
			"id":          "msg_test456",
			"type":        "message",
			"role":        "assistant",
			"model":       "claude-3-haiku-20240307",
			"stop_reason": "end_turn",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "I understand. How can I assist you?",
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  15,
				"output_tokens": 12,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	messages := []Message{
		NewSystemMessage("You are a helpful assistant"),
		NewUserMessage("Hello"),
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1)
	require.NoError(t, err)
	assert.Equal(t, "I understand. How can I assist you?", result.Choices[0].Message.Content)
}

func TestAnthropicProvider_ChatCompletion_WithTools(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		tools, ok := reqBody["tools"].([]interface{})
		assert.True(t, ok, "tools field should be present")
		assert.Len(t, tools, 1)

		tool := tools[0].(map[string]interface{})
		assert.Equal(t, "get_weather", tool["name"])
		assert.Equal(t, "Get weather for a location", tool["description"])

		response := map[string]interface{}{
			"id":          "msg_tool123",
			"type":        "message",
			"role":        "assistant",
			"model":       "claude-3-haiku-20240307",
			"stop_reason": "tool_use",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "Let me check the weather for you.",
				},
				{
					"type": "tool_use",
					"id":   "toolu_abc123",
					"name": "get_weather",
					"input": map[string]interface{}{
						"location": "San Francisco",
					},
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  25,
				"output_tokens": 30,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	messages := []Message{
		NewUserMessage("What's the weather in San Francisco?"),
	}

	tools := []openai.ChatCompletionToolParam{
		{
			Type: "function",
			Function: openai.FunctionDefinitionParam{
				Name:        "get_weather",
				Description: openaiParam.NewOpt("Get weather for a location"),
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"location": map[string]interface{}{
							"type":        "string",
							"description": "City name",
						},
					},
					"required": []string{"location"},
				},
			},
		},
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1, tools)
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.Equal(t, "tool_calls", result.Choices[0].FinishReason)
	assert.Len(t, result.Choices[0].Message.ToolCalls, 1)

	toolCall := result.Choices[0].Message.ToolCalls[0]
	assert.Equal(t, "toolu_abc123", toolCall.ID)
	assert.Equal(t, "function", string(toolCall.Type))
	assert.Equal(t, "get_weather", toolCall.Function.Name)

	var toolArgs map[string]interface{}
	err = json.Unmarshal([]byte(toolCall.Function.Arguments), &toolArgs)
	require.NoError(t, err)
	assert.Equal(t, "San Francisco", toolArgs["location"])
}

func TestAnthropicProvider_ChatCompletion_WithToolResults(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		messages := reqBody["messages"].([]interface{})
		assert.Len(t, messages, 3)

		toolResultMsg := messages[2].(map[string]interface{})
		assert.Equal(t, "user", toolResultMsg["role"])

		content := toolResultMsg["content"].([]interface{})
		toolResult := content[0].(map[string]interface{})
		assert.Equal(t, "tool_result", toolResult["type"])
		assert.Equal(t, "toolu_abc123", toolResult["tool_use_id"])

		response := map[string]interface{}{
			"id":          "msg_final",
			"type":        "message",
			"role":        "assistant",
			"model":       "claude-3-haiku-20240307",
			"stop_reason": "end_turn",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "The weather in San Francisco is sunny and 72°F.",
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  40,
				"output_tokens": 15,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	assistantMsg := NewAssistantMessage("")
	if m := assistantMsg.OfAssistant; m != nil {
		m.ToolCalls = []openai.ChatCompletionMessageToolCallParam{
			{
				ID: "toolu_abc123",
				Function: openai.ChatCompletionMessageToolCallFunctionParam{
					Name:      "get_weather",
					Arguments: `{"location": "San Francisco"}`,
				},
			},
		}
	}

	messages := []Message{
		NewUserMessage("What's the weather?"),
		assistantMsg,
		ToolMessage(`{"temperature": 72, "condition": "sunny"}`, "toolu_abc123"),
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1)
	require.NoError(t, err)
	assert.Contains(t, result.Choices[0].Message.Content, "sunny")
	assert.Contains(t, result.Choices[0].Message.Content, "72")
}

func TestAnthropicProvider_ChatCompletion_MaxTokensStopReason(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		response := map[string]interface{}{
			"id":          "msg_truncated",
			"type":        "message",
			"role":        "assistant",
			"model":       "claude-3-haiku-20240307",
			"stop_reason": "max_tokens",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "This is a very long response that got truncated because",
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  10,
				"output_tokens": 1024,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	messages := []Message{
		NewUserMessage("Tell me a long story"),
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1)
	require.NoError(t, err)
	assert.Equal(t, "length", result.Choices[0].FinishReason)
}

func TestAnthropicProvider_ChatCompletionStream_SimpleMessage(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		// The Anthropic SDK handles streaming headers internally

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		flusher, ok := w.(http.Flusher)
		require.True(t, ok)

		events := []string{
			`event: message_start
data: {"type":"message_start","message":{"id":"msg_stream123","type":"message","role":"assistant","model":"claude-3-haiku-20240307","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}

`,
			`event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

`,
			`event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

`,
			`event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there!"}}

`,
			`event: content_block_stop
data: {"type":"content_block_stop","index":0}

`,
			`event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}

`,
			`event: message_stop
data: {"type":"message_stop"}

`,
		}

		for _, event := range events {
			_, _ = w.Write([]byte(event))
			flusher.Flush()
		}
	})
	defer server.Close()

	messages := []Message{
		NewUserMessage("Hi"),
	}

	var chunks []*openai.ChatCompletionChunk
	streamFunc := func(chunk *openai.ChatCompletionChunk) error {
		chunks = append(chunks, chunk)
		return nil
	}

	result, err := provider.ChatCompletionStream(context.Background(), messages, 1, streamFunc)
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.True(t, len(chunks) > 0, "should have received chunks")

	fullContent := ""
	for _, chunk := range chunks {
		if len(chunk.Choices) > 0 {
			fullContent += chunk.Choices[0].Delta.Content
		}
	}
	assert.Equal(t, "Hello there!", fullContent)

	assert.Equal(t, "msg_stream123", result.ID)
	assert.Equal(t, "Hello there!", result.Choices[0].Message.Content)
	assert.Equal(t, "stop", result.Choices[0].FinishReason)
}

func TestAnthropicProvider_ChatCompletionStream_WithToolUse(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)

		events := []string{
			`event: message_start
data: {"type":"message_start","message":{"id":"msg_tool_stream","type":"message","role":"assistant","model":"claude-3-haiku-20240307","content":[],"stop_reason":null,"usage":{"input_tokens":20,"output_tokens":0}}}

`,
			`event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

`,
			`event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Let me check that for you."}}

`,
			`event: content_block_stop
data: {"type":"content_block_stop","index":0}

`,
			`event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_stream123","name":"get_weather","input":{}}}

`,
			`event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"loc"}}

`,
			`event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"ation\":\"NYC\"}"}}

`,
			`event: content_block_stop
data: {"type":"content_block_stop","index":1}

`,
			`event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":25}}

`,
			`event: message_stop
data: {"type":"message_stop"}

`,
		}

		for _, event := range events {
			_, _ = w.Write([]byte(event))
			flusher.Flush()
		}
	})
	defer server.Close()

	messages := []Message{
		NewUserMessage("What's the weather in NYC?"),
	}

	tools := []openai.ChatCompletionToolParam{
		{
			Type: "function",
			Function: openai.FunctionDefinitionParam{
				Name:        "get_weather",
				Description: openaiParam.NewOpt("Get weather"),
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"location": map[string]interface{}{
							"type": "string",
						},
					},
				},
			},
		},
	}

	var chunksReceived int
	streamFunc := func(chunk *openai.ChatCompletionChunk) error {
		chunksReceived++
		return nil
	}

	result, err := provider.ChatCompletionStream(context.Background(), messages, 1, streamFunc, tools)
	require.NoError(t, err)
	require.NotNil(t, result)

	// Note: Anthropic provider doesn't stream tool call chunks, only text chunks
	// Tool calls are accumulated and returned in the final result
	assert.Equal(t, "tool_calls", result.Choices[0].FinishReason)
	assert.Len(t, result.Choices[0].Message.ToolCalls, 1)
	assert.Equal(t, "toolu_stream123", result.Choices[0].Message.ToolCalls[0].ID)
	assert.Equal(t, "get_weather", result.Choices[0].Message.ToolCalls[0].Function.Name)
}

func TestAnthropicProvider_ConvertMessagesToAnthropic_MultipleRoles(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		messages := reqBody["messages"].([]interface{})
		assert.Len(t, messages, 2)

		msg1 := messages[0].(map[string]interface{})
		assert.Equal(t, "user", msg1["role"])

		msg2 := messages[1].(map[string]interface{})
		assert.Equal(t, "assistant", msg2["role"])

		system := reqBody["system"].([]interface{})
		assert.Len(t, system, 1)
		systemBlock := system[0].(map[string]interface{})
		assert.Equal(t, "You are helpful", systemBlock["text"])

		response := map[string]interface{}{
			"id":          "msg_multi",
			"type":        "message",
			"role":        "assistant",
			"model":       "claude-3-haiku-20240307",
			"stop_reason": "end_turn",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "Response",
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  30,
				"output_tokens": 5,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	messages := []Message{
		NewSystemMessage("You are helpful"),
		NewUserMessage("Question 1"),
		NewAssistantMessage("Answer 1"),
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1)
	require.NoError(t, err)
	assert.NotNil(t, result)
}

func TestAnthropicProvider_ChatCompletion_ErrorResponse(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Header().Set("Content-Type", "application/json")
		errorResp := map[string]interface{}{
			"type": "error",
			"error": map[string]interface{}{
				"type":    "invalid_request_error",
				"message": "Invalid API key",
			},
		}
		_ = json.NewEncoder(w).Encode(errorResp)
	})
	defer server.Close()

	messages := []Message{
		NewUserMessage("Hello"),
	}

	_, err := provider.ChatCompletion(context.Background(), messages, 1)
	assert.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "invalid")
}

func TestAnthropicProvider_ConvertToolsToAnthropic_ComplexSchema(t *testing.T) {
	server, provider := setupAnthropicMockServer(t, func(w http.ResponseWriter, r *http.Request) {
		var reqBody map[string]interface{}
		err := json.NewDecoder(r.Body).Decode(&reqBody)
		require.NoError(t, err)

		tools := reqBody["tools"].([]interface{})
		assert.Len(t, tools, 1)

		tool := tools[0].(map[string]interface{})
		assert.Equal(t, "complex_function", tool["name"])

		inputSchema := tool["input_schema"].(map[string]interface{})
		assert.Equal(t, "object", inputSchema["type"])

		properties := inputSchema["properties"].(map[string]interface{})
		assert.Contains(t, properties, "nested")
		assert.Contains(t, properties, "array_field")

		response := map[string]interface{}{
			"id":          "msg_complex",
			"type":        "message",
			"role":        "assistant",
			"model":       "claude-3-haiku-20240307",
			"stop_reason": "end_turn",
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": "OK",
				},
			},
			"usage": map[string]interface{}{
				"input_tokens":  50,
				"output_tokens": 5,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(response)
	})
	defer server.Close()

	tools := []openai.ChatCompletionToolParam{
		{
			Type: "function",
			Function: openai.FunctionDefinitionParam{
				Name:        "complex_function",
				Description: openaiParam.NewOpt("A complex function with nested schema"),
				Parameters: map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"nested": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"field1": map[string]interface{}{
									"type": "string",
								},
								"field2": map[string]interface{}{
									"type": "number",
								},
							},
						},
						"array_field": map[string]interface{}{
							"type": "array",
							"items": map[string]interface{}{
								"type": "string",
							},
						},
					},
					"required": []string{"nested"},
				},
			},
		},
	}

	messages := []Message{
		NewUserMessage("Test"),
	}

	result, err := provider.ChatCompletion(context.Background(), messages, 1, tools)
	require.NoError(t, err)
	assert.NotNil(t, result)
}
