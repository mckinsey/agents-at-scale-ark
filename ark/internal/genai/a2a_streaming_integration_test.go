package genai

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
	"trpc.group/trpc-go/trpc-a2a-go/server"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
)

type streamingTestProcessor struct{}

func ptrBool(value bool) *bool {
	return &value
}

func (p *streamingTestProcessor) ProcessMessage(ctx context.Context, message protocol.Message, options taskmanager.ProcessOptions, handler taskmanager.TaskHandler) (*taskmanager.MessageProcessingResult, error) {
	taskID, err := handler.BuildTask(nil, message.ContextID)
	if err != nil {
		return nil, err
	}
	taskHandle, err := handler.GetTask(&taskID)
	if err != nil {
		return nil, err
	}
	task := taskHandle.Task()
	if options.Streaming {
		subscriber, err := handler.SubscribeTask(&taskID)
		if err != nil {
			return nil, err
		}
		go func() {
			defer subscriber.Close()
			_ = handler.UpdateTaskState(&taskID, protocol.TaskStateWorking, nil)
			artifact := protocol.Artifact{
				ArtifactID: "artifact-1",
				Parts: []protocol.Part{
					protocol.NewTextPart("delta"),
				},
			}
			_ = handler.AddArtifact(&taskID, artifact, true, false)
			statusMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("done"),
			})
			_ = handler.UpdateTaskState(&taskID, protocol.TaskStateCompleted, &statusMessage)
		}()
		return &taskmanager.MessageProcessingResult{StreamingEvents: subscriber}, nil
	}
	go func() {
		_ = handler.UpdateTaskState(&taskID, protocol.TaskStateWorking, nil)
		artifact := protocol.Artifact{
			ArtifactID: "artifact-1",
			Parts: []protocol.Part{
				protocol.NewTextPart("delta"),
			},
		}
		_ = handler.AddArtifact(&taskID, artifact, true, false)
		statusMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("done"),
		})
		_ = handler.UpdateTaskState(&taskID, protocol.TaskStateCompleted, &statusMessage)
	}()
	return &taskmanager.MessageProcessingResult{Result: task}, nil
}

func startStreamingTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	processor := &streamingTestProcessor{}
	manager, err := taskmanager.NewMemoryTaskManager(processor)
	require.NoError(t, err)
	agentCard := server.AgentCard{
		Name:        "test-agent",
		Description: "test",
		URL:         "http://example.com/",
		Version:     "1.0.0",
		Capabilities: server.AgentCapabilities{
			Streaming: ptrBool(true),
		},
		DefaultInputModes:  []string{"text"},
		DefaultOutputModes: []string{"text"},
		Skills: []server.AgentSkill{
			{
				ID:   "test-skill",
				Name: "test-skill",
				Tags: []string{"test"},
			},
		},
	}
	a2aServer, err := server.NewA2AServer(agentCard, manager)
	require.NoError(t, err)
	return httptest.NewServer(a2aServer.Handler())
}

func TestStreamA2AAgentIntegrationCompat(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	userInput, convErr := OpenAIToA2AMessage(NewUserMessage("hello"))
	require.NoError(t, convErr)
	events, err := StreamA2AAgent(ctx, nil, testServer.URL, nil, "", userInput, nil, "test-agent", "", nil)
	require.NoError(t, err)

	engine := &A2AExecutionEngine{}
	stream := &fakeEventStream{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)
	require.NoError(t, err)

	assert.Contains(t, response.Content, "delta")
	foundArtifact := false
	foundStatus := false
	for _, chunk := range stream.chunks {
		wrapped, ok := chunk.(ChunkWithMetadata)
		require.True(t, ok)
		require.NotNil(t, wrapped.Ark)
		if _, ok := wrapped.Ark.A2A.(*protocol.TaskArtifactUpdateEvent); ok {
			foundArtifact = true
		}
		if status, ok := wrapped.Ark.A2A.(*protocol.TaskStatusUpdateEvent); ok && status.Status.State == protocol.TaskStateWorking {
			foundStatus = true
		}
	}
	assert.True(t, foundArtifact)
	assert.True(t, foundStatus)
}

func TestStreamA2AAgentIntegrationEmitsMultipleChunks(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	userInput, convErr := OpenAIToA2AMessage(NewUserMessage("hello"))
	require.NoError(t, convErr)
	events, err := StreamA2AAgent(ctx, nil, testServer.URL, nil, "", userInput, nil, "test-agent", "", nil)
	require.NoError(t, err)

	engine := &A2AExecutionEngine{}
	stream := &fakeEventStream{}
	_, err = engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)
	require.NoError(t, err)

	require.Greater(t, len(stream.chunks), 1, "stream must emit more than one chunk (non-buffered)")

	chunksBeforeTerminal := 0
	for _, chunk := range stream.chunks {
		wrapped, ok := chunk.(ChunkWithMetadata)
		require.True(t, ok)
		if status, isStatus := wrapped.Ark.A2A.(*protocol.TaskStatusUpdateEvent); isStatus && status.Final {
			break
		}
		chunksBeforeTerminal++
	}
	assert.Greater(t, chunksBeforeTerminal, 0, "at least one intermediate chunk must precede the terminal event")
}

func TestStreamA2AAgentIntegrationPreservesEnvelopeShape(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	ctx = WithExecutionMetadata(ctx, map[string]interface{}{
		"agent": "agent-one",
		"team":  "team-one",
		"model": "model-one",
	})

	userInput, convErr := OpenAIToA2AMessage(NewUserMessage("hello"))
	require.NoError(t, convErr)
	events, err := StreamA2AAgent(ctx, nil, testServer.URL, nil, "", userInput, nil, "test-agent", "", nil)
	require.NoError(t, err)

	engine := &A2AExecutionEngine{}
	stream := &fakeEventStream{}
	_, err = engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)
	require.NoError(t, err)

	require.NotEmpty(t, stream.chunks)
	for i, chunk := range stream.chunks {
		wrapped, ok := chunk.(ChunkWithMetadata)
		require.True(t, ok, "chunk %d must be ChunkWithMetadata", i)

		require.NotNil(t, wrapped.ChatCompletionChunk, "chunk %d must contain OpenAI chunk", i)
		require.NotEmpty(t, wrapped.Choices, "chunk %d must have choices", i)

		require.NotNil(t, wrapped.Ark, "chunk %d must have ark metadata", i)
		assert.NotNil(t, wrapped.Ark.A2A, "chunk %d must have ark.a2a payload", i)
		assert.Equal(t, "agent-one", wrapped.Ark.Agent, "chunk %d must carry agent metadata", i)
		assert.Equal(t, "team-one", wrapped.Ark.Team, "chunk %d must carry team metadata", i)
		assert.Equal(t, "model-one", wrapped.Ark.Model, "chunk %d must carry model metadata", i)
	}
}

func TestStreamA2AAgentIntegrationMaintainsEventOrder(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	userInput, convErr := OpenAIToA2AMessage(NewUserMessage("hello"))
	require.NoError(t, convErr)
	events, err := StreamA2AAgent(ctx, nil, testServer.URL, nil, "", userInput, nil, "test-agent", "", nil)
	require.NoError(t, err)

	engine := &A2AExecutionEngine{}
	stream := &fakeEventStream{}
	_, err = engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)
	require.NoError(t, err)

	firstWorkingIdx := -1
	firstArtifactIdx := -1
	completedIdx := -1

	for i, chunk := range stream.chunks {
		wrapped, ok := chunk.(ChunkWithMetadata)
		require.True(t, ok)

		switch ev := wrapped.Ark.A2A.(type) {
		case *protocol.TaskStatusUpdateEvent:
			if ev.Status.State == protocol.TaskStateWorking && firstWorkingIdx == -1 {
				firstWorkingIdx = i
			}
			if ev.Status.State == protocol.TaskStateCompleted {
				completedIdx = i
			}
		case *protocol.TaskArtifactUpdateEvent:
			if firstArtifactIdx == -1 {
				firstArtifactIdx = i
			}
		}
	}

	assert.GreaterOrEqual(t, firstWorkingIdx, 0, "must observe working status")
	assert.GreaterOrEqual(t, firstArtifactIdx, 0, "must observe artifact update")
	assert.GreaterOrEqual(t, completedIdx, 0, "must observe completed status")
	assert.Less(t, firstWorkingIdx, completedIdx, "working must precede completed")
	assert.Less(t, firstArtifactIdx, completedIdx, "artifact must precede completed")
}
