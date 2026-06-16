package completions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyToolChoiceToParams(t *testing.T) {
	t.Run("unset leaves ToolChoice omitted", func(t *testing.T) {
		params := openai.ChatCompletionNewParams{}
		applyToolChoiceToParams(ToolChoiceUnset, &params)
		assert.True(t, param.IsOmitted(params.ToolChoice.OfAuto))
	})

	t.Run("required sets OfAuto to required", func(t *testing.T) {
		params := openai.ChatCompletionNewParams{}
		applyToolChoiceToParams(ToolChoiceRequired, &params)
		require.False(t, param.IsOmitted(params.ToolChoice.OfAuto))
		assert.Equal(t, "required", params.ToolChoice.OfAuto.Value)
	})

	t.Run("auto and none pass through", func(t *testing.T) {
		auto := openai.ChatCompletionNewParams{}
		applyToolChoiceToParams(ToolChoiceAuto, &auto)
		assert.Equal(t, "auto", auto.ToolChoice.OfAuto.Value)
		none := openai.ChatCompletionNewParams{}
		applyToolChoiceToParams(ToolChoiceNone, &none)
		assert.Equal(t, "none", none.ToolChoice.OfAuto.Value)
	})
}

func TestOpenAIProvider_ChatCompletion_SendsToolChoice(t *testing.T) {
	cases := []struct {
		name       string
		toolChoice ToolChoice
		expectKey  bool
		expectVal  string
	}{
		{"required is forwarded", ToolChoiceRequired, true, "required"},
		{"auto is forwarded", ToolChoiceAuto, true, "auto"},
		{"unset is omitted", ToolChoiceUnset, false, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var captured map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.NoError(t, json.NewDecoder(r.Body).Decode(&captured))
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"id":"cmpl-1","object":"chat.completion","created":0,"model":"test","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{}}`))
			}))
			defer server.Close()

			provider := &OpenAIProvider{
				Model:   "test",
				BaseURL: server.URL,
				APIKey:  "test",
			}
			messages := []Message{NewUserMessage("hi")}
			_, err := provider.ChatCompletion(context.Background(), messages, 1, nil, tc.toolChoice)
			require.NoError(t, err)

			if tc.expectKey {
				require.Contains(t, captured, "tool_choice")
				assert.Equal(t, tc.expectVal, captured["tool_choice"])
			} else {
				assert.NotContains(t, captured, "tool_choice")
			}
		})
	}
}

func TestAgentExecute_ForwardsToolChoiceToProvider(t *testing.T) {
	provider := &mockChatProvider{
		response: &openai.ChatCompletion{
			ID:    "cmpl-1",
			Model: "test-model",
			Choices: []openai.ChatCompletionChoice{
				{
					Message:      openai.ChatCompletionMessage{Role: "assistant", Content: "ok"},
					FinishReason: "stop",
				},
			},
		},
	}
	agent := newTestAgent("test-agent", provider)

	_, err := agent.Execute(context.Background(), NewUserMessage("hi"), nil, nil, nil, ExecuteOptions{ToolChoice: ToolChoiceRequired})
	require.NoError(t, err)
	assert.Equal(t, ToolChoiceRequired, provider.capturedToolChoice)
}

func TestAgentExecute_DefaultsToolChoiceUnset(t *testing.T) {
	provider := &mockChatProvider{
		response: &openai.ChatCompletion{
			ID:    "cmpl-1",
			Model: "test-model",
			Choices: []openai.ChatCompletionChoice{
				{
					Message:      openai.ChatCompletionMessage{Role: "assistant", Content: "ok"},
					FinishReason: "stop",
				},
			},
		},
	}
	agent := newTestAgent("test-agent", provider)

	_, err := agent.Execute(context.Background(), NewUserMessage("hi"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Equal(t, ToolChoiceUnset, provider.capturedToolChoice)
}
