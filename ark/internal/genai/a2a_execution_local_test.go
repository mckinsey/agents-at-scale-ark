package genai

import (
	"context"
	"errors"
	"fmt"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type testChatCompletionProvider struct {
	responses []*openai.ChatCompletion
	errs      []error
	calls     [][]openai.ChatCompletionMessageParamUnion
	a2aCalls  [][]protocol.Message
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
	nativeCopy := append([]protocol.Message(nil), messages...)
	p.a2aCalls = append(p.a2aCalls, nativeCopy)

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

