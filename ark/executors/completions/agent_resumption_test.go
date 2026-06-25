package completions

import (
	"context"
	"fmt"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestReconstructMessagesForResumption(t *testing.T) {
	ctx := context.Background()
	a := &Agent{}

	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID: "call-1",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "deploy",
				Arguments: `{"env":"prod"}`,
			},
		},
	}

	t.Run("uses memory history when available", func(t *testing.T) {
		mem := &stubMemory{
			getMessages: []Message{NewUserMessage("first"), NewAssistantMessage("hi")},
		}
		approvedResults := []ToolResult{{ID: "call-1", Content: "deployed"}}

		agentMsgs, newMsgs, err := a.reconstructMessagesForResumption(ctx, toolCalls, approvedResults, mem, nil)

		require.NoError(t, err)
		// memory(2) + assistant tool-call(1) + tool result(1) = 4
		assert.Len(t, agentMsgs, 4)
		// newMsgs is assistant + tool result = 2
		assert.Len(t, newMsgs, 2)
	})

	t.Run("falls back to originalInput when memory is empty", func(t *testing.T) {
		mem := &stubMemory{getMessages: []Message{}}
		original := []Message{NewUserMessage("only original")}
		approvedResults := []ToolResult{{ID: "call-1", Content: "deployed"}}

		agentMsgs, newMsgs, err := a.reconstructMessagesForResumption(ctx, toolCalls, approvedResults, mem, original)

		require.NoError(t, err)
		// original(1) + assistant tool-call(1) + tool result(1) = 3
		assert.Len(t, agentMsgs, 3)
		assert.Len(t, newMsgs, 2)
	})

	t.Run("formats rejection error as tool message content", func(t *testing.T) {
		mem := &stubMemory{getMessages: []Message{NewUserMessage("ask")}}
		rejectedResults := []ToolResult{{ID: "call-1", Error: "Tool execution rejected by user"}}

		agentMsgs, newMsgs, err := a.reconstructMessagesForResumption(ctx, toolCalls, rejectedResults, mem, nil)

		require.NoError(t, err)
		assert.Len(t, agentMsgs, 3)
		assert.Len(t, newMsgs, 2)
	})

	t.Run("propagates memory errors", func(t *testing.T) {
		mem := &stubMemory{failOnGet: fmt.Errorf("memory unreachable")}
		_, _, err := a.reconstructMessagesForResumption(ctx, toolCalls, nil, mem, nil)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "memory unreachable")
	})

	t.Run("handles multiple tool calls", func(t *testing.T) {
		mem := &stubMemory{getMessages: []Message{NewUserMessage("ask")}}
		multiToolCalls := []openai.ChatCompletionMessageToolCall{
			{ID: "c1", Function: openai.ChatCompletionMessageToolCallFunction{Name: "a"}},
			{ID: "c2", Function: openai.ChatCompletionMessageToolCallFunction{Name: "b"}},
		}
		results := []ToolResult{
			{ID: "c1", Content: "ok-1"},
			{ID: "c2", Content: "ok-2"},
		}

		agentMsgs, newMsgs, err := a.reconstructMessagesForResumption(ctx, multiToolCalls, results, mem, nil)

		require.NoError(t, err)
		// 1 memory + 1 assistant + 2 tool results = 4
		assert.Len(t, agentMsgs, 4)
		// 1 assistant + 2 tool results = 3
		assert.Len(t, newMsgs, 3)
	})
}

func TestResumeFromApproval(t *testing.T) {
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:       "call-1",
			Function: openai.ChatCompletionMessageToolCallFunction{Name: "deploy", Arguments: "{}"},
		},
	}
	approvedResults := []ToolResult{{ID: "call-1", Content: "deployed"}}

	t.Run("errors when model is not configured", func(t *testing.T) {
		a := &Agent{Name: "no-model", Namespace: "default"}

		_, err := a.ResumeFromApproval(context.Background(), toolCalls, approvedResults, &stubMemory{}, nil, nil)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "no model configured")
	})

	t.Run("completes when model returns a final response", func(t *testing.T) {
		provider := &mockChatProvider{
			response: &openai.ChatCompletion{
				ID:    "cmpl-1",
				Model: "test-model",
				Choices: []openai.ChatCompletionChoice{
					{
						Message:      openai.ChatCompletionMessage{Role: "assistant", Content: "all done"},
						FinishReason: "stop",
					},
				},
			},
		}
		agent := newTestAgent("resume-agent", provider)
		mem := &stubMemory{getMessages: []Message{NewUserMessage("deploy it")}}

		result, err := agent.ResumeFromApproval(context.Background(), toolCalls, approvedResults, mem, nil, nil)

		require.NoError(t, err)
		require.NotNil(t, result)
		// assistant tool-call + tool result + final assistant message
		require.GreaterOrEqual(t, len(result.Messages), 3)
		last := result.Messages[len(result.Messages)-1]
		require.NotNil(t, last.OfAssistant)
	})

	t.Run("returns cascading approval error when resumed tool needs approval", func(t *testing.T) {
		provider := &mockChatProvider{
			response: &openai.ChatCompletion{
				ID:    "cmpl-2",
				Model: "test-model",
				Choices: []openai.ChatCompletionChoice{
					{
						Message: openai.ChatCompletionMessage{
							Role: "assistant",
							ToolCalls: []openai.ChatCompletionMessageToolCall{
								{
									ID:       "call-2",
									Function: openai.ChatCompletionMessageToolCallFunction{Name: "dangerous-tool", Arguments: "{}"},
								},
							},
						},
						FinishReason: "tool_calls",
					},
				},
			},
		}
		agent := newTestAgent("resume-agent", provider)
		agent.approvalRequiredTools = map[string]*arkv1alpha1.ToolApprovalConfig{
			"dangerous-tool": {Required: true},
		}
		mem := &stubMemory{getMessages: []Message{NewUserMessage("deploy it")}}

		_, err := agent.ResumeFromApproval(context.Background(), toolCalls, approvedResults, mem, nil, nil)

		var approvalErr *ApprovalRequiredError
		require.ErrorAs(t, err, &approvalErr)
	})
}
