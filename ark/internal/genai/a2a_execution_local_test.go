package genai

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type testChatCompletionProvider struct {
	responses []*openai.ChatCompletion
	errs      []error
	calls     [][]openai.ChatCompletionMessageParamUnion
}

func (p *testChatCompletionProvider) ChatCompletion(_ context.Context, messages []openai.ChatCompletionMessageParamUnion, _ int64, _ ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	copied := append([]openai.ChatCompletionMessageParamUnion(nil), messages...)
	p.calls = append(p.calls, copied)
	callIndex := len(p.calls) - 1
	if callIndex < len(p.errs) && p.errs[callIndex] != nil {
		return nil, p.errs[callIndex]
	}
	if callIndex < len(p.responses) {
		return p.responses[callIndex], nil
	}
	return nil, fmt.Errorf("unexpected model call index %d", callIndex)
}

func (p *testChatCompletionProvider) ChatCompletionStream(ctx context.Context, messages []openai.ChatCompletionMessageParamUnion, n int64, _ func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	return p.ChatCompletion(ctx, messages, n, tools...)
}

func (p *testChatCompletionProvider) SetOutputSchema(_ *runtime.RawExtension, _ string) {}

func (p *testChatCompletionProvider) A2ATurnNative(_ context.Context, messages []protocol.Message, outcomes []A2AToolOutcome, _ []A2AToolDefinition, _ EventStreamInterface) (*A2ATurnResult, error) {
	compatMessages, err := convertA2AMessagesToCompatMultimodal(messages)
	if err != nil {
		return nil, err
	}
	outcomeMessages := a2aToolOutcomesToOpenAI(outcomes)
	if len(outcomeMessages) > 0 {
		compatMessages = append(compatMessages, outcomeMessages...)
	}
	p.calls = append(p.calls, append([]openai.ChatCompletionMessageParamUnion(nil), compatMessages...))
	callIndex := len(p.calls) - 1
	if callIndex < len(p.errs) && p.errs[callIndex] != nil {
		return nil, p.errs[callIndex]
	}
	if callIndex >= len(p.responses) {
		return nil, fmt.Errorf("unexpected model call index %d", callIndex)
	}
	choiceSet := p.responses[callIndex].Choices
	if len(choiceSet) == 0 {
		return nil, fmt.Errorf("missing model choices for call index %d", callIndex)
	}
	return buildA2ATurnResultFromChatChoice(choiceSet[0], "")
}

type testToolExecutor struct {
	result ToolResult
	err    error
	calls  []ToolCall
}

func (e *testToolExecutor) Execute(_ context.Context, call ToolCall) (ToolResult, error) {
	e.calls = append(e.calls, call)
	result := e.result
	if result.ID == "" {
		result.ID = call.ID
	}
	if result.Name == "" {
		result.Name = call.Function.Name
	}
	return result, e.err
}

func testCompletion(content string, toolCalls []openai.ChatCompletionMessageToolCall) *openai.ChatCompletion {
	return &openai.ChatCompletion{
		Choices: []openai.ChatCompletionChoice{
			{
				Message: openai.ChatCompletionMessage{
					Role:      "assistant",
					Content:   content,
					ToolCalls: toolCalls,
				},
			},
		},
	}
}

func newTestAgentForLocalExecution(provider ChatCompletionProvider, tools *ToolRegistry) *Agent {
	return &Agent{
		Name:      "test-agent",
		Namespace: "default",
		Prompt:    "You are a test assistant.",
		Model: &Model{
			Model:             "test-model",
			Type:              "openai",
			Provider:          provider,
			telemetryRecorder: telemetrynoop.NewModelRecorder(),
			eventingRecorder:  eventingnoop.NewModelRecorder(),
		},
		Tools: tools,
	}
}

func newTestToolRegistry(executor ToolExecutor) *ToolRegistry {
	registry := NewToolRegistry(nil, telemetrynoop.NewToolRecorder(), eventingnoop.NewProvider().ToolRecorder())
	registry.RegisterTool(ToolDefinition{
		Name:        "lookup",
		Description: "test tool",
		Parameters: map[string]any{
			"type": "object",
		},
	}, executor)
	return registry
}

func stringPointer(value string) *string {
	return &value
}

type failingEventStream struct {
	failOnCall int
	calls      int
}

func (f *failingEventStream) StreamChunk(_ context.Context, _ interface{}) error {
	f.calls++
	if f.failOnCall > 0 && f.calls == f.failOnCall {
		return errors.New("stream boom")
	}
	return nil
}

func (f *failingEventStream) NotifyCompletion(_ context.Context) error {
	return nil
}

func (f *failingEventStream) Close() error {
	return nil
}

func TestExecuteLocallyA2ANativeSimpleResponse(t *testing.T) {
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("native-response", nil),
		},
	}
	agent := newTestAgentForLocalExecution(provider, nil)
	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	}, stringPointer("task-1"), stringPointer("ctx-1"))
	history := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("previous"),
		}),
	}
	stream := &fakeEventStream{}

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, history, nil, stream)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Len(t, result.A2AMessages, 1)
	assert.Equal(t, "native-response", ExtractA2ATextFromMessage(result.A2AMessages[0]))
	assert.Equal(t, A2APayloadModeNative, result.A2APayloadMode)
	assert.Empty(t, result.Messages)
	require.NotNil(t, result.A2AMessages[0].ContextID)
	require.NotNil(t, result.A2AMessages[0].TaskID)
	assert.Equal(t, "ctx-1", *result.A2AMessages[0].ContextID)
	assert.Equal(t, "task-1", *result.A2AMessages[0].TaskID)
	require.Len(t, stream.chunks, 1)
	_, ok := stream.chunks[0].(*protocol.Message)
	assert.True(t, ok)
}

func TestExecuteLocallyA2ANativeWithToolCalls(t *testing.T) {
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:   "call-1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "lookup",
				Arguments: `{"city":"london"}`,
			},
		},
	}
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("calling tool", toolCalls),
			testCompletion("final answer", nil),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool result"},
	}
	registry := newTestToolRegistry(executor)
	agent := newTestAgentForLocalExecution(provider, registry)
	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	}, stringPointer("task-1"), stringPointer("ctx-1"))
	stream := &fakeEventStream{}

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, stream)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Len(t, executor.calls, 1)
	assert.Equal(t, "lookup", executor.calls[0].Function.Name)
	require.Len(t, result.A2AMessages, 2)
	assert.Equal(t, "calling tool", ExtractA2ATextFromMessage(result.A2AMessages[0]))
	assert.Equal(t, "final answer", ExtractA2ATextFromMessage(result.A2AMessages[1]))
	require.Len(t, provider.calls, 2)
	require.Len(t, stream.chunks, 2)
	require.NotEmpty(t, provider.calls[1])
	lastModelMessage := provider.calls[1][len(provider.calls[1])-1]
	require.NotNil(t, lastModelMessage.OfTool)
	assert.Equal(t, "call-1", lastModelMessage.OfTool.ToolCallID)
	assert.Contains(t, lastModelMessage.OfTool.Content.OfString.Value, `"schema":"https://ark.mckinsey.com/payloads/tool-result/v1"`)
	assert.Contains(t, lastModelMessage.OfTool.Content.OfString.Value, `"content":"tool result"`)
}

func TestExecuteLocallyA2ANativeContextAndTaskIDPropagation(t *testing.T) {
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:   "call-1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "lookup",
				Arguments: `{"city":"london"}`,
			},
		},
	}
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("calling tool", toolCalls),
			testCompletion("final answer", nil),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool result"},
	}
	agent := newTestAgentForLocalExecution(provider, newTestToolRegistry(executor))
	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	}, stringPointer("task-input"), stringPointer("ctx-input"))

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, nil)
	require.NoError(t, err)
	for _, message := range result.A2AMessages {
		require.NotNil(t, message.ContextID)
		require.NotNil(t, message.TaskID)
		assert.Equal(t, "ctx-input", *message.ContextID)
		assert.Equal(t, "task-input", *message.TaskID)
	}
}

func TestExecuteLocallyA2ANativeEventStreamEmitsA2AMessages(t *testing.T) {
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:   "call-1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "lookup",
				Arguments: `{"city":"london"}`,
			},
		},
	}
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("calling tool", toolCalls),
			testCompletion("final answer", nil),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool result"},
	}
	agent := newTestAgentForLocalExecution(provider, newTestToolRegistry(executor))
	stream := &fakeEventStream{}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	_, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, stream)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 2)
	for _, chunk := range stream.chunks {
		_, ok := chunk.(*protocol.Message)
		assert.True(t, ok)
	}
}

func TestExecuteLocallyA2ANativeIntermediateStreamFailure(t *testing.T) {
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:   "call-1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "lookup",
				Arguments: `{"city":"london"}`,
			},
		},
	}
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("calling tool", toolCalls),
			testCompletion("final answer", nil),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool result"},
	}
	agent := newTestAgentForLocalExecution(provider, newTestToolRegistry(executor))
	stream := &failingEventStream{failOnCall: 1}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, stream)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to stream assistant A2A message")
	assert.Nil(t, result)
}

func TestExecuteLocallyA2ANativeFinalStreamFailure(t *testing.T) {
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("final answer", nil),
		},
	}
	agent := newTestAgentForLocalExecution(provider, nil)
	stream := &failingEventStream{failOnCall: 1}
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, stream)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to stream final A2A message")
	assert.Nil(t, result)
}

func TestExecuteLocallyA2ANativeModelError(t *testing.T) {
	provider := &testChatCompletionProvider{
		errs: []error{errors.New("model boom")},
	}
	agent := newTestAgentForLocalExecution(provider, nil)
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "model boom")
	assert.Nil(t, result)
}

func TestExecuteLocallyA2ANativeToolError(t *testing.T) {
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:   "call-1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "lookup",
				Arguments: `{"city":"london"}`,
			},
		},
	}
	provider := &testChatCompletionProvider{
		responses: []*openai.ChatCompletion{
			testCompletion("calling tool", toolCalls),
		},
	}
	executor := &testToolExecutor{
		result: ToolResult{Content: "tool failed"},
		err:    errors.New("tool boom"),
	}
	agent := newTestAgentForLocalExecution(provider, newTestToolRegistry(executor))
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := agent.executeLocallyA2ANative(context.Background(), userInput, nil, nil, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "tool boom")
	assert.Nil(t, result)
}
