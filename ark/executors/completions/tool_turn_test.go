package completions

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func messageRole(t *testing.T, msg Message) string {
	t.Helper()
	raw, err := json.Marshal(openai.ChatCompletionMessageParamUnion(msg))
	require.NoError(t, err)

	var payload struct {
		Role string `json:"role"`
	}
	require.NoError(t, json.Unmarshal(raw, &payload))
	return payload.Role
}

func messageRoles(t *testing.T, messages []Message) []string {
	t.Helper()
	roles := make([]string, 0, len(messages))
	for _, msg := range messages {
		roles = append(roles, messageRole(t, msg))
	}
	return roles
}

type toolTurnCase struct {
	name   string
	tools  []struct{ name, image string }
	expect []string
}

// Both paths that build a tool turn must produce the same message sequence: every tool
// message answering one assistant tool_calls block contiguous, image messages after them.
func toolTurnCases() []toolTurnCase {
	type tool = struct{ name, image string }
	return []toolTurnCase{
		{
			name:   "no tool returns an image",
			tools:  []tool{{name: "alpha"}, {name: "beta"}},
			expect: []string{"tool", "tool"},
		},
		{
			name:   "the first of two tool calls returns an image",
			tools:  []tool{{name: "alpha", image: "image/png"}, {name: "beta"}},
			expect: []string{"tool", "tool", "user"},
		},
		{
			name:   "the last of two tool calls returns an image",
			tools:  []tool{{name: "alpha"}, {name: "beta", image: "image/png"}},
			expect: []string{"tool", "tool", "user"},
		},
		{
			name:   "both tool calls return an image",
			tools:  []tool{{name: "alpha", image: "image/png"}, {name: "beta", image: "image/png"}},
			expect: []string{"tool", "tool", "user", "user"},
		},
		{
			name:   "a single tool call returns an image",
			tools:  []tool{{name: "alpha", image: "image/png"}},
			expect: []string{"tool", "user"},
		},
	}
}

func TestToolTurnSequenceThroughTheAgentLoop(t *testing.T) {
	for _, tc := range toolTurnCases() {
		t.Run(tc.name, func(t *testing.T) {
			registry := newTestRegistry()
			calls := make([]openai.ChatCompletionMessageToolCall, 0, len(tc.tools))
			for i, tool := range tc.tools {
				stub := &stubImageExecutor{}
				if tool.image != "" {
					stub.images = []ToolResultImage{newToolResultImage(tool.image, pngBytes)}
				}
				registry.RegisterTool(ToolDefinition{Name: tool.name}, stub)
				calls = append(calls, toolCall(toolCallID(i), tool.name))
			}

			agent := &Agent{Name: "test-agent", Namespace: "default", Tools: registry}

			var agentMessages []Message
			var newMessages []Message
			require.NoError(t, agent.executeToolCalls(context.Background(), calls, &agentMessages, &newMessages))

			assert.Equal(t, tc.expect, messageRoles(t, agentMessages))
			assert.Equal(t, agentMessages, newMessages)
		})
	}
}

func TestToolTurnSequenceThroughTheApprovalResumePath(t *testing.T) {
	for _, tc := range toolTurnCases() {
		t.Run(tc.name, func(t *testing.T) {
			calls := make([]openai.ChatCompletionMessageToolCall, 0, len(tc.tools))
			results := make([]ToolResult, 0, len(tc.tools))
			for i, tool := range tc.tools {
				calls = append(calls, toolCall(toolCallID(i), tool.name))
				result := ToolResult{ID: toolCallID(i), Name: tool.name, Content: "done"}
				if tool.image != "" {
					result.Images = []ToolResultImage{newToolResultImage(tool.image, pngBytes)}
				}
				results = append(results, result)
			}

			agent := &Agent{Name: "test-agent", Namespace: "default"}

			agentMessages, newMessages, err := agent.reconstructMessagesForResumption(
				context.Background(), calls, results, &stubMemory{}, nil)
			require.NoError(t, err)

			expect := append([]string{"assistant"}, tc.expect...)
			assert.Equal(t, expect, messageRoles(t, agentMessages),
				"an approved tool call must produce the same sequence as an unapproved one")
			assert.Equal(t, agentMessages, newMessages)
		})
	}
}

func TestToolTurnImageMessagesKeepToolCallOrder(t *testing.T) {
	registry := newTestRegistry()
	registry.RegisterTool(ToolDefinition{Name: "first"}, &stubImageExecutor{
		images: []ToolResultImage{imageOfSize(t, 10)},
	})
	registry.RegisterTool(ToolDefinition{Name: "second"}, &stubImageExecutor{
		images: []ToolResultImage{imageOfSize(t, 20)},
	})

	agent := &Agent{Name: "test-agent", Namespace: "default", Tools: registry}

	var agentMessages []Message
	var newMessages []Message
	require.NoError(t, agent.executeToolCalls(context.Background(),
		[]openai.ChatCompletionMessageToolCall{toolCall("call-0", "first"), toolCall("call-1", "second")},
		&agentMessages, &newMessages))

	require.Len(t, agentMessages, 4)

	firstText, firstImages, _ := extractMessageParts(agentMessages[2])
	assert.Contains(t, firstText, "first")
	require.Len(t, firstImages, 1)
	assert.Equal(t, 10, firstImages[0].Bytes)

	secondText, secondImages, _ := extractMessageParts(agentMessages[3])
	assert.Contains(t, secondText, "second")
	require.Len(t, secondImages, 1)
	assert.Equal(t, 20, secondImages[0].Bytes)
}

func toolCallID(i int) string {
	return string(rune('a' + i))
}
