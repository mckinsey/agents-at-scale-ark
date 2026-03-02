package genai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

type fakeClaudeProvider struct {
	response *ClaudeMessageResponse
	err      error
	lastReq  ClaudeMessageRequest
}

func (f *fakeClaudeProvider) CreateMessage(_ context.Context, req ClaudeMessageRequest) (*ClaudeMessageResponse, error) {
	f.lastReq = req
	return f.response, f.err
}

func newTestClaudeAdapter(provider ClaudeMessagesProvider) A2AModelProvider {
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	return NewClaudeA2AModelAdapter(provider, "claude-3-sonnet", "test-agent", tp.ModelRecorder(), ep.ModelRecorder())
}

func TestClaudeA2AModelAdapterBasicTurn(t *testing.T) {
	provider := &fakeClaudeProvider{
		response: &ClaudeMessageResponse{
			ID:         "msg-1",
			Content:    []ClaudePart{{Type: "text", Text: "Hello from Claude"}},
			StopReason: "end_turn",
			Usage:      &ClaudeUsage{InputTokens: 10, OutputTokens: 5},
		},
	}
	adapter := newTestClaudeAdapter(provider)

	messages := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("Hi")}),
	}

	result, err := adapter.A2ATurn(context.Background(), messages, nil, nil, nil)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "Hello from Claude", result.Content)
	assert.Equal(t, "claude-3-sonnet", provider.lastReq.Model)
	require.NotNil(t, result.Usage)
	assert.Equal(t, int64(10), result.Usage.PromptTokens)
	assert.Equal(t, int64(5), result.Usage.CompletionTokens)
}

func TestClaudeA2AModelAdapterToolCalls(t *testing.T) {
	provider := &fakeClaudeProvider{
		response: &ClaudeMessageResponse{
			ID: "msg-2",
			Content: []ClaudePart{
				{Type: "text", Text: "Let me look that up"},
				{Type: "tool_use", ID: "toolu_1", Name: "search", Input: map[string]any{"query": "test"}},
			},
			StopReason: "tool_use",
		},
	}
	adapter := newTestClaudeAdapter(provider)

	tools := []A2AToolDefinition{{Name: "search", Description: "Search", Parameters: map[string]any{"type": "object"}}}
	result, err := adapter.A2ATurn(context.Background(), nil, nil, tools, nil)

	require.NoError(t, err)
	require.Len(t, result.ToolCalls, 1)
	assert.Equal(t, "toolu_1", result.ToolCalls[0].ID)
	assert.Equal(t, "search", result.ToolCalls[0].Name)
	assert.Contains(t, result.ToolCalls[0].Arguments, "test")
	require.Len(t, provider.lastReq.Tools, 1)
	assert.Equal(t, "search", provider.lastReq.Tools[0].Name)
}

func TestClaudeA2AModelAdapterToolOutcomes(t *testing.T) {
	provider := &fakeClaudeProvider{
		response: &ClaudeMessageResponse{
			ID:         "msg-3",
			Content:    []ClaudePart{{Type: "text", Text: "Result found"}},
			StopReason: "end_turn",
		},
	}
	adapter := newTestClaudeAdapter(provider)

	messages := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("tool call")}),
	}
	outcomes := []A2AToolOutcome{{ToolCallID: "toolu_1", Content: `{"result":"42"}`}}

	_, err := adapter.A2ATurn(context.Background(), messages, outcomes, nil, nil)
	require.NoError(t, err)

	lastMsg := provider.lastReq.Messages[len(provider.lastReq.Messages)-1]
	assert.Equal(t, "user", lastMsg.Role)
	require.Len(t, lastMsg.Content, 1)
	assert.Equal(t, "tool_result", lastMsg.Content[0].Type)
	assert.Equal(t, "toolu_1", lastMsg.Content[0].ToolUseID)
}

func TestClaudeA2AModelAdapterError(t *testing.T) {
	provider := &fakeClaudeProvider{err: errors.New("claude error")}
	adapter := newTestClaudeAdapter(provider)

	_, err := adapter.A2ATurn(context.Background(), nil, nil, nil, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "claude error")
}
