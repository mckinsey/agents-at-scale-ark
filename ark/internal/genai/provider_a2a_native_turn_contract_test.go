package genai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func buildNativeTurnTestMessages() []protocol.Message {
	system := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("system prompt"),
		&protocol.DataPart{
			Kind: protocol.KindData,
			Data: RoleHintPayloadV1{
				Schema: A2APayloadSchemaRoleHintV1,
				Role:   RoleSystem,
			},
		},
	})
	user := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("user asks"),
	})
	assistant := protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
		[]protocol.Part{protocol.NewTextPart("calling tool")},
		ToolCallsPayloadV1{
			Schema: A2APayloadSchemaToolCallsV1,
			ToolCalls: []ToolCallPayloadV1{
				{
					ID:        "call-1",
					Name:      "lookup",
					Arguments: `{"city":"london"}`,
				},
			},
		},
	))
	return []protocol.Message{system, user, assistant}
}

func buildNativeTurnTestMessagesWithEmptyAssistantText() []protocol.Message {
	system := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("system prompt"),
		&protocol.DataPart{
			Kind: protocol.KindData,
			Data: RoleHintPayloadV1{
				Schema: A2APayloadSchemaRoleHintV1,
				Role:   RoleSystem,
			},
		},
	})
	user := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("user asks"),
	})
	assistant := protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
		[]protocol.Part{protocol.NewTextPart("")},
		ToolCallsPayloadV1{
			Schema: A2APayloadSchemaToolCallsV1,
			ToolCalls: []ToolCallPayloadV1{
				{
					ID:        "call-1",
					Name:      "lookup",
					Arguments: `{"city":"london"}`,
				},
			},
		},
	))
	return []protocol.Message{system, user, assistant}
}

func buildNativeTurnTestOutcomes() []A2AToolOutcome {
	return []A2AToolOutcome{
		{
			ToolCallID: "call-1",
			Content:    `{"schema":"https://ark.mckinsey.com/payloads/tool-result/v1","content":"tool result"}`,
		},
	}
}

func buildNativeTurnTestMessagesWithMultipleToolCalls() []protocol.Message {
	system := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("system prompt"),
		&protocol.DataPart{
			Kind: protocol.KindData,
			Data: RoleHintPayloadV1{
				Schema: A2APayloadSchemaRoleHintV1,
				Role:   RoleSystem,
			},
		},
	})
	user := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("user asks"),
	})
	assistant := protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
		[]protocol.Part{protocol.NewTextPart("calling tools")},
		ToolCallsPayloadV1{
			Schema: A2APayloadSchemaToolCallsV1,
			ToolCalls: []ToolCallPayloadV1{
				{
					ID:        "call-1",
					Name:      "lookup",
					Arguments: `{"city":"london"}`,
				},
				{
					ID:        "call-2",
					Name:      "lookup",
					Arguments: `{"city":"paris"}`,
				},
			},
		},
	))
	return []protocol.Message{system, user, assistant}
}

func decodeMessageObject(t *testing.T, raw any) map[string]any {
	t.Helper()
	msg, ok := raw.(map[string]any)
	require.True(t, ok)
	return msg
}

func extractToolCallIDs(t *testing.T, assistant map[string]any) []string {
	t.Helper()
	rawToolCalls, ok := assistant["tool_calls"].([]any)
	require.True(t, ok)
	ids := make([]string, 0, len(rawToolCalls))
	for _, raw := range rawToolCalls {
		toolCall := decodeMessageObject(t, raw)
		id, ok := toolCall["id"].(string)
		require.True(t, ok)
		ids = append(ids, id)
	}
	return ids
}

func TestOpenAIProviderA2ATurnNativeSendsCompatMessages(t *testing.T) {
	var captured []any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/v1/chat/completions", r.URL.Path)
		assert.Contains(t, r.Header.Get("Authorization"), "Bearer test-key")

		var request map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		rawMessages, ok := request["messages"].([]any)
		require.True(t, ok)
		captured = rawMessages

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]any{
				{
					"index": 0,
					"message": map[string]any{
						"role":    "assistant",
						"content": "final answer",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]any{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	result, err := provider.A2ATurnNative(
		context.Background(),
		buildNativeTurnTestMessages(),
		buildNativeTurnTestOutcomes(),
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "final answer", result.Content)
	assert.Equal(t, "final answer", extractTextFromParts(result.Message.Parts))
	assert.Len(t, result.ToolCalls, 0)
	require.NotNil(t, result.Usage)
	assert.Equal(t, int64(10), result.Usage.PromptTokens)
	assert.Equal(t, int64(5), result.Usage.CompletionTokens)
	assert.Equal(t, int64(15), result.Usage.TotalTokens)

	require.Len(t, captured, 4)
	system := decodeMessageObject(t, captured[0])
	user := decodeMessageObject(t, captured[1])
	assistant := decodeMessageObject(t, captured[2])
	tool := decodeMessageObject(t, captured[3])

	assert.Equal(t, "system", system["role"])
	assert.Equal(t, "system prompt", system["content"])
	assert.Equal(t, "user", user["role"])
	assert.Equal(t, "user asks", user["content"])
	assert.Equal(t, "assistant", assistant["role"])
	assert.Equal(t, "calling tool", assistant["content"])
	assert.Equal(t, "tool", tool["role"])
	assert.Equal(t, "call-1", tool["tool_call_id"])
	assert.Contains(t, tool["content"], `"tool result"`)
}

func TestAzureProviderA2ATurnNativeSendsCompatMessages(t *testing.T) {
	var captured []any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/openai/deployments/gpt-4/chat/completions", r.URL.Path)
		assert.Equal(t, "2024-02-15-preview", r.URL.Query().Get("api-version"))
		assert.Equal(t, "test-key", r.Header.Get("api-key"))

		var request map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		rawMessages, ok := request["messages"].([]any)
		require.True(t, ok)
		captured = rawMessages

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]any{
				{
					"index": 0,
					"message": map[string]any{
						"role":    "assistant",
						"content": "azure answer",
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]any{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL,
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	result, err := provider.A2ATurnNative(
		context.Background(),
		buildNativeTurnTestMessages(),
		buildNativeTurnTestOutcomes(),
		nil,
		nil,
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "azure answer", result.Content)
	assert.Equal(t, "azure answer", extractTextFromParts(result.Message.Parts))
	assert.Len(t, result.ToolCalls, 0)
	require.NotNil(t, result.Usage)
	assert.Equal(t, int64(10), result.Usage.PromptTokens)
	assert.Equal(t, int64(5), result.Usage.CompletionTokens)
	assert.Equal(t, int64(15), result.Usage.TotalTokens)

	require.Len(t, captured, 4)
	system := decodeMessageObject(t, captured[0])
	user := decodeMessageObject(t, captured[1])
	assistant := decodeMessageObject(t, captured[2])
	tool := decodeMessageObject(t, captured[3])

	assert.Equal(t, "system", system["role"])
	assert.Equal(t, "system prompt", system["content"])
	assert.Equal(t, "user", user["role"])
	assert.Equal(t, "user asks", user["content"])
	assert.Equal(t, "assistant", assistant["role"])
	assert.Equal(t, "calling tool", assistant["content"])
	assert.Equal(t, "tool", tool["role"])
	assert.Equal(t, "call-1", tool["tool_call_id"])
	assert.Contains(t, tool["content"], `"tool result"`)
}

func newCaptureServer(t *testing.T, answer string) (*httptest.Server, *[]any) {
	t.Helper()
	var captured []any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		rawMessages, ok := request["messages"].([]any)
		require.True(t, ok)
		captured = rawMessages

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":      "chatcmpl-test",
			"object":  "chat.completion",
			"created": 1234567890,
			"model":   "gpt-4",
			"choices": []map[string]any{
				{
					"index": 0,
					"message": map[string]any{
						"role":    "assistant",
						"content": answer,
					},
					"finish_reason": "stop",
				},
			},
			"usage": map[string]any{
				"prompt_tokens":     10,
				"completion_tokens": 5,
				"total_tokens":      15,
			},
		})
	}))
	return server, &captured
}

func TestOpenAIProviderA2ATurnNativeDropsUnpairedAssistantToolCalls(t *testing.T) {
	server, capturedPtr := newCaptureServer(t, "final answer")
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	_, err := provider.A2ATurnNative(
		context.Background(),
		buildNativeTurnTestMessagesWithMultipleToolCalls(),
		buildNativeTurnTestOutcomes(),
		nil,
		nil,
	)
	require.NoError(t, err)

	captured := *capturedPtr
	require.Len(t, captured, 5)
	assistant := decodeMessageObject(t, captured[2])
	tool1 := decodeMessageObject(t, captured[3])
	tool2 := decodeMessageObject(t, captured[4])

	assert.Equal(t, []string{"call-1", "call-2"}, extractToolCallIDs(t, assistant))
	assert.Equal(t, "tool", tool1["role"])
	assert.Equal(t, "call-1", tool1["tool_call_id"])
	assert.Equal(t, "tool", tool2["role"])
	assert.Equal(t, "call-2", tool2["tool_call_id"])
}

func TestAzureProviderA2ATurnNativeDropsUnpairedAssistantToolCalls(t *testing.T) {
	server, capturedPtr := newCaptureServer(t, "azure answer")
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL,
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	_, err := provider.A2ATurnNative(
		context.Background(),
		buildNativeTurnTestMessagesWithMultipleToolCalls(),
		buildNativeTurnTestOutcomes(),
		nil,
		nil,
	)
	require.NoError(t, err)

	captured := *capturedPtr
	require.Len(t, captured, 5)
	assistant := decodeMessageObject(t, captured[2])
	tool1 := decodeMessageObject(t, captured[3])
	tool2 := decodeMessageObject(t, captured[4])

	assert.Equal(t, []string{"call-1", "call-2"}, extractToolCallIDs(t, assistant))
	assert.Equal(t, "tool", tool1["role"])
	assert.Equal(t, "call-1", tool1["tool_call_id"])
	assert.Equal(t, "tool", tool2["role"])
	assert.Equal(t, "call-2", tool2["tool_call_id"])
}

func TestOpenAIProviderA2ATurnNativeNormalizesEmptyAssistantContent(t *testing.T) {
	server, capturedPtr := newCaptureServer(t, "final answer")
	defer server.Close()

	provider := &OpenAIProvider{
		Model:   "gpt-4",
		BaseURL: server.URL + "/v1",
		APIKey:  "test-key",
	}

	_, err := provider.A2ATurnNative(
		context.Background(),
		buildNativeTurnTestMessagesWithEmptyAssistantText(),
		buildNativeTurnTestOutcomes(),
		nil,
		nil,
	)
	require.NoError(t, err)
	captured := *capturedPtr
	require.Len(t, captured, 4)
	assistant := decodeMessageObject(t, captured[2])
	assert.Equal(t, "assistant", assistant["role"])
	assert.Equal(t, emptyTextContentFallback, assistant["content"])
}

func TestAzureProviderA2ATurnNativeNormalizesEmptyAssistantContent(t *testing.T) {
	server, capturedPtr := newCaptureServer(t, "azure answer")
	defer server.Close()

	provider := &AzureProvider{
		Model:      "gpt-4",
		BaseURL:    server.URL,
		APIKey:     "test-key",
		APIVersion: "2024-02-15-preview",
	}

	_, err := provider.A2ATurnNative(
		context.Background(),
		buildNativeTurnTestMessagesWithEmptyAssistantText(),
		buildNativeTurnTestOutcomes(),
		nil,
		nil,
	)
	require.NoError(t, err)
	captured := *capturedPtr
	require.Len(t, captured, 4)
	assistant := decodeMessageObject(t, captured[2])
	assert.Equal(t, "assistant", assistant["role"])
	assert.Equal(t, emptyTextContentFallback, assistant["content"])
}
