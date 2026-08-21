package completions

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubImageExecutor struct {
	images []ToolResultImage
}

func (s *stubImageExecutor) Execute(_ context.Context, call ToolCall) (ToolResult, error) {
	return ToolResult{
		ID:      call.ID,
		Name:    call.Function.Name,
		Content: "done",
		Images:  s.images,
	}, nil
}

func imageOfSize(t *testing.T, size int) ToolResultImage {
	t.Helper()
	return ToolResultImage{MediaType: "image/png", Data: make([]byte, size)}
}

func toolCall(id, name string) openai.ChatCompletionMessageToolCall {
	return openai.ChatCompletionMessageToolCall{
		ID:       id,
		Function: openai.ChatCompletionMessageToolCallFunction{Name: name, Arguments: "{}"},
	}
}

func imagePartCount(t *testing.T, msg Message) int {
	t.Helper()
	raw, err := json.Marshal(openai.ChatCompletionMessageParamUnion(msg))
	require.NoError(t, err)

	var payload struct {
		Content []struct {
			Type string `json:"type"`
		} `json:"content"`
	}
	require.NoError(t, json.Unmarshal(raw, &payload))

	count := 0
	for _, part := range payload.Content {
		if part.Type == "image_url" {
			count++
		}
	}
	return count
}

func TestImageTurnBudgetAdmit(t *testing.T) {
	t.Setenv(toolImageMaxBytesPerTurnEnv, "100")

	t.Run("images within the budget are all admitted", func(t *testing.T) {
		budget := newImageTurnBudget()
		kept, note := budget.admit(context.Background(), "read",
			[]ToolResultImage{imageOfSize(t, 40), imageOfSize(t, 40)})

		require.Len(t, kept, 2)
		assert.Empty(t, note)
		assert.Equal(t, 20, budget.remaining)
	})

	t.Run("an image that would exceed the budget is dropped", func(t *testing.T) {
		budget := newImageTurnBudget()
		kept, note := budget.admit(context.Background(), "read",
			[]ToolResultImage{imageOfSize(t, 80), imageOfSize(t, 80)})

		require.Len(t, kept, 1)
		assert.Contains(t, note, "the 100 byte image budget for this turn is exhausted")
		assert.Contains(t, note, "not shown to the model")
		assert.Equal(t, 20, budget.remaining)
	})

	t.Run("a smaller image still fits after a larger one is dropped", func(t *testing.T) {
		budget := newImageTurnBudget()
		kept, _ := budget.admit(context.Background(), "read",
			[]ToolResultImage{imageOfSize(t, 90), imageOfSize(t, 80), imageOfSize(t, 10)})

		require.Len(t, kept, 2)
		assert.Len(t, kept[0].Data, 90)
		assert.Len(t, kept[1].Data, 10)
	})

	t.Run("no images means no note", func(t *testing.T) {
		budget := newImageTurnBudget()
		kept, note := budget.admit(context.Background(), "read", nil)

		assert.Empty(t, kept)
		assert.Empty(t, note)
	})
}

func TestExecuteToolCallsAppliesTurnBudgetAcrossToolCalls(t *testing.T) {
	t.Setenv(toolImageMaxBytesPerTurnEnv, "100")

	registry := newTestRegistry()
	registry.RegisterTool(ToolDefinition{Name: "first"}, &stubImageExecutor{
		images: []ToolResultImage{imageOfSize(t, 80)},
	})
	registry.RegisterTool(ToolDefinition{Name: "second"}, &stubImageExecutor{
		images: []ToolResultImage{imageOfSize(t, 80)},
	})

	agent := &Agent{Name: "test-agent", Namespace: "default", Tools: registry}

	var agentMessages []Message
	var newMessages []Message
	err := agent.executeToolCalls(context.Background(),
		[]openai.ChatCompletionMessageToolCall{toolCall("call-1", "first"), toolCall("call-2", "second")},
		&agentMessages, &newMessages)
	require.NoError(t, err)

	require.Len(t, agentMessages, 3, "two tool messages plus one image message")
	assert.Equal(t, agentMessages, newMessages)
	assert.Equal(t, 1, imagePartCount(t, agentMessages[2]), "the first tool call fits the budget")

	secondToolText := toolMessageText(t, agentMessages[1])
	assert.Contains(t, secondToolText, "the 100 byte image budget for this turn is exhausted")
	assert.Contains(t, secondToolText, "done", "the tool text is kept alongside the note")
}

func toolMessageText(t *testing.T, msg Message) string {
	t.Helper()
	raw, err := json.Marshal(openai.ChatCompletionMessageParamUnion(msg))
	require.NoError(t, err)

	var payload struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	require.NoError(t, json.Unmarshal(raw, &payload))
	require.Equal(t, "tool", payload.Role)
	return payload.Content
}
