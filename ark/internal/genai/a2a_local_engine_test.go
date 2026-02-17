package genai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type testA2AModelProvider struct {
	results []*A2ATurnResult
	errs    []error
	calls   int
}

func (p *testA2AModelProvider) A2ATurn(_ context.Context, _ []protocol.Message, _ []A2AToolDefinition, _ EventStreamInterface) (*A2ATurnResult, error) {
	idx := p.calls
	p.calls++
	if idx < len(p.errs) && p.errs[idx] != nil {
		return nil, p.errs[idx]
	}
	if idx < len(p.results) {
		return p.results[idx], nil
	}
	return nil, errors.New("unexpected call")
}

func a2aAssistantResult(content string) *A2ATurnResult {
	return &A2ATurnResult{
		Message: protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(content),
		}),
		Content: content,
	}
}

func a2aToolCallResult(content string, toolCalls []A2AToolCall) *A2ATurnResult {
	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(content),
	})
	if len(toolCalls) > 0 {
		msg.Metadata = map[string]interface{}{
			MetadataToolCallsKey: toolCalls,
		}
	}
	return &A2ATurnResult{
		Message:   msg,
		ToolCalls: toolCalls,
		Content:   content,
	}
}

func TestA2ALocalEngineSimpleResponse(t *testing.T) {
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{a2aAssistantResult("hello world")},
	}
	engine := NewA2ALocalEngine(provider, nil, "test/agent")

	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	}, stringPointer("task-1"), stringPointer("ctx-1"))
	messages := []protocol.Message{userInput}
	stream := &fakeEventStream{}

	result, err := engine.Execute(context.Background(), userInput, messages, stream)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, A2APayloadModeNative, result.A2APayloadMode)
	require.Len(t, result.A2AMessages, 1)
	assert.Equal(t, "hello world", ExtractA2ATextFromMessage(result.A2AMessages[0]))
	assert.Empty(t, result.Messages)
	require.NotNil(t, result.A2AResponse)
	assert.Equal(t, "hello world", result.A2AResponse.Content)
	assert.Equal(t, 1, provider.calls)
	require.Len(t, stream.chunks, 1)
}

func TestA2ALocalEngineWithToolCalls(t *testing.T) {
	toolCalls := []A2AToolCall{
		{ID: "call-1", Name: "lookup", Arguments: `{"city":"london"}`},
	}
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{
			a2aToolCallResult("calling tool", toolCalls),
			a2aAssistantResult("final answer"),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool result"},
	}
	registry := newTestToolRegistry(executor)
	engine := NewA2ALocalEngine(provider, registry, "test/agent")

	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	}, stringPointer("task-1"), stringPointer("ctx-1"))
	messages := []protocol.Message{userInput}
	stream := &fakeEventStream{}

	result, err := engine.Execute(context.Background(), userInput, messages, stream)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Len(t, result.A2AMessages, 3)
	assert.Equal(t, "calling tool", ExtractA2ATextFromMessage(result.A2AMessages[0]))
	assert.Equal(t, "tool result", ExtractA2ATextFromMessage(result.A2AMessages[1]))
	assert.Equal(t, "final answer", ExtractA2ATextFromMessage(result.A2AMessages[2]))
	assert.Equal(t, 2, provider.calls)
	require.Len(t, stream.chunks, 3)
	require.Len(t, executor.calls, 1)
	assert.Equal(t, "lookup", executor.calls[0].Function.Name)
}

func TestA2ALocalEngineNilProviderHardFail(t *testing.T) {
	engine := NewA2ALocalEngine(nil, nil, "test/agent")
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	})

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, nil)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrA2AModelProviderNotSupported)
	assert.Nil(t, result)
}

func TestA2ALocalEngineModelError(t *testing.T) {
	provider := &testA2AModelProvider{
		errs: []error{errors.New("model boom")},
	}
	engine := NewA2ALocalEngine(provider, nil, "test/agent")
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	})

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "model boom")
	assert.Nil(t, result)
}

func TestA2ALocalEngineToolError(t *testing.T) {
	toolCalls := []A2AToolCall{
		{ID: "call-1", Name: "lookup", Arguments: `{"city":"london"}`},
	}
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{
			a2aToolCallResult("calling tool", toolCalls),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool failed"},
		err:    errors.New("tool boom"),
	}
	registry := newTestToolRegistry(executor)
	engine := NewA2ALocalEngine(provider, registry, "test/agent")

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	})

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "tool boom")
	assert.Nil(t, result)
}

func TestA2ALocalEngineContextIDAndTaskIDPropagation(t *testing.T) {
	toolCalls := []A2AToolCall{
		{ID: "call-1", Name: "lookup", Arguments: `{"x":"1"}`},
	}
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{
			a2aToolCallResult("calling tool", toolCalls),
			a2aAssistantResult("done"),
		},
	}
	executor := &testToolExecutor{result: ToolResult{Content: "r"}}
	registry := newTestToolRegistry(executor)
	engine := NewA2ALocalEngine(provider, registry, "test/agent")

	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	}, stringPointer("task-x"), stringPointer("ctx-x"))

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, nil)
	require.NoError(t, err)
	for _, msg := range result.A2AMessages {
		require.NotNil(t, msg.ContextID)
		require.NotNil(t, msg.TaskID)
		assert.Equal(t, "ctx-x", *msg.ContextID)
		assert.Equal(t, "task-x", *msg.TaskID)
	}
}

func TestA2ALocalEngineToolResultBuildsA2AMessage(t *testing.T) {
	result := ToolResult{
		ID:      "call-42",
		Name:    "weather",
		Content: "sunny",
	}
	msg := buildA2AToolResultMessage(result)

	assert.Equal(t, protocol.MessageRoleAgent, msg.Role)
	assert.Equal(t, "sunny", ExtractA2ATextFromMessage(msg))
	require.NotNil(t, msg.Metadata)
	assert.Equal(t, RoleTool, msg.Metadata[MetadataRoleKey])
	assert.Equal(t, "call-42", msg.Metadata[MetadataToolCallIDKey])
	assert.Equal(t, "weather", msg.Metadata[MetadataToolNameKey])
}

func TestA2ALocalEngineStreamFailure(t *testing.T) {
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{a2aAssistantResult("hello")},
	}
	engine := NewA2ALocalEngine(provider, nil, "test/agent")
	stream := &failingEventStream{failOnCall: 1}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	})

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, stream)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to stream final A2A message")
	assert.Nil(t, result)
}

func TestA2AToolCallRoundTripFidelity(t *testing.T) {
	toolCalls := []A2AToolCall{
		{ID: "call-a", Name: "search", Arguments: `{"q":"test"}`},
		{ID: "call-b", Name: "calc", Arguments: `{"expr":"1+1"}`},
	}
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{
			a2aToolCallResult("planning", toolCalls),
			a2aAssistantResult("result is 2"),
		},
	}
	searchExec := &testToolExecutor{result: ToolResult{Content: "found it"}}
	calcExec := &testToolExecutor{result: ToolResult{Content: "2"}}

	registry := NewToolRegistry(nil, telemetrynoop.NewToolRecorder(), eventingnoop.NewProvider().ToolRecorder())
	registry.RegisterTool(ToolDefinition{Name: "search", Description: "search", Parameters: map[string]any{"type": "object"}}, searchExec)
	registry.RegisterTool(ToolDefinition{Name: "calc", Description: "calc", Parameters: map[string]any{"type": "object"}}, calcExec)

	engine := NewA2ALocalEngine(provider, registry, "test/agent")
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("test"),
	})

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, nil)
	require.NoError(t, err)
	require.Len(t, result.A2AMessages, 4)

	require.Len(t, searchExec.calls, 1)
	assert.Equal(t, "search", searchExec.calls[0].Function.Name)
	assert.Equal(t, `{"q":"test"}`, searchExec.calls[0].Function.Arguments)
	assert.Equal(t, "call-a", searchExec.calls[0].ID)

	require.Len(t, calcExec.calls, 1)
	assert.Equal(t, "calc", calcExec.calls[0].Function.Name)
	assert.Equal(t, `{"expr":"1+1"}`, calcExec.calls[0].Function.Arguments)
	assert.Equal(t, "call-b", calcExec.calls[0].ID)

	toolResultA := result.A2AMessages[1]
	assert.Equal(t, "found it", ExtractA2ATextFromMessage(toolResultA))
	assert.Equal(t, RoleTool, toolResultA.Metadata[MetadataRoleKey])
	assert.Equal(t, "call-a", toolResultA.Metadata[MetadataToolCallIDKey])

	toolResultB := result.A2AMessages[2]
	assert.Equal(t, "2", ExtractA2ATextFromMessage(toolResultB))
	assert.Equal(t, "call-b", toolResultB.Metadata[MetadataToolCallIDKey])

	assert.Equal(t, "result is 2", ExtractA2ATextFromMessage(result.A2AMessages[3]))
}

func TestA2ALocalEngineNoToolsConfigured(t *testing.T) {
	toolCalls := []A2AToolCall{
		{ID: "call-1", Name: "lookup", Arguments: `{}`},
	}
	provider := &testA2AModelProvider{
		results: []*A2ATurnResult{
			a2aToolCallResult("calling tool", toolCalls),
		},
	}
	engine := NewA2ALocalEngine(provider, nil, "test/agent")
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hi"),
	})

	result, err := engine.Execute(context.Background(), userInput, []protocol.Message{userInput}, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "has no tools configured")
	assert.Nil(t, result)
}

func TestExecuteToolA2ADelegatesToExecuteTool(t *testing.T) {
	executor := &testToolExecutor{
		result: ToolResult{Content: "a2a tool result"},
	}
	registry := newTestToolRegistry(executor)

	a2aCall := A2AToolCall{
		ID:        "a2a-call-1",
		Name:      "lookup",
		Arguments: `{"key":"value"}`,
	}

	result, err := registry.ExecuteToolA2A(context.Background(), a2aCall)
	require.NoError(t, err)
	assert.Equal(t, "a2a tool result", result.Content)
	require.Len(t, executor.calls, 1)
	assert.Equal(t, "a2a-call-1", executor.calls[0].ID)
	assert.Equal(t, "lookup", executor.calls[0].Function.Name)
	assert.Equal(t, `{"key":"value"}`, executor.calls[0].Function.Arguments)
}
