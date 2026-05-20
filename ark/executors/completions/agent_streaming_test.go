package completions

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"

	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

type mockChatProvider struct {
	response           *openai.ChatCompletion
	chunks             []*openai.ChatCompletionChunk
	capturedToolChoice ToolChoice
}

func (m *mockChatProvider) ChatCompletion(_ context.Context, _ []Message, _ int64, _ []openai.ChatCompletionToolParam, toolChoice ToolChoice) (*openai.ChatCompletion, error) {
	m.capturedToolChoice = toolChoice
	return m.response, nil
}

func (m *mockChatProvider) ChatCompletionStream(_ context.Context, _ []Message, _ int64, streamFunc func(*openai.ChatCompletionChunk) error, _ []openai.ChatCompletionToolParam, toolChoice ToolChoice) (*openai.ChatCompletion, error) {
	m.capturedToolChoice = toolChoice
	for _, chunk := range m.chunks {
		if err := streamFunc(chunk); err != nil {
			return nil, err
		}
	}
	return m.response, nil
}

func (m *mockChatProvider) SetOutputSchema(_ *runtime.RawExtension, _ string) {}

func newTestAgent(name string, provider ChatCompletionProvider) *Agent {
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	return &Agent{
		Name:      name,
		Namespace: "default",
		Model: &Model{
			Model:             "test-model",
			Provider:          provider,
			telemetryRecorder: tp.ModelRecorder(),
			eventingRecorder:  ep.ModelRecorder(),
		},
		Tools:             NewToolRegistry(nil, tp.ToolRecorder(), ep.ToolRecorder()),
		telemetryRecorder: tp.AgentRecorder(),
		eventingRecorder:  ep.AgentRecorder(),
	}
}

func TestAgentExecute_StreamingChunksIncludeAgentName(t *testing.T) {
	agentName := "my-agent"

	finalResponse := &openai.ChatCompletion{
		ID:    "cmpl-1",
		Model: "test-model",
		Choices: []openai.ChatCompletionChoice{
			{
				Message:      openai.ChatCompletionMessage{Role: "assistant", Content: "hello"},
				FinishReason: "stop",
			},
		},
	}
	chunks := []*openai.ChatCompletionChunk{
		{
			ID:    "cmpl-1",
			Model: "test-model",
			Choices: []openai.ChatCompletionChunkChoice{
				{Delta: openai.ChatCompletionChunkChoiceDelta{Content: "hello"}},
			},
		},
		{
			ID:    "cmpl-1",
			Model: "test-model",
			Choices: []openai.ChatCompletionChunkChoice{
				{FinishReason: "stop"},
			},
		},
	}

	provider := &mockChatProvider{response: finalResponse, chunks: chunks}
	agent := newTestAgent(agentName, provider)
	stream := &mockEventStream{}

	_, err := agent.Execute(context.Background(), NewUserMessage("hi"), nil, nil, stream, ExecuteOptions{})
	require.NoError(t, err)

	require.NotEmpty(t, stream.chunks, "expected streaming chunks to be emitted")

	for i, raw := range stream.chunks {
		wrapped, ok := raw.(ChunkWithMetadata)
		require.True(t, ok, "chunk %d is not ChunkWithMetadata", i)
		require.NotNil(t, wrapped.Ark, "chunk %d missing ark metadata", i)
		assert.Equal(t, agentName, wrapped.Ark.Agent, "chunk %d: expected ark.agent=%q, got %q", i, agentName, wrapped.Ark.Agent)
	}
}
