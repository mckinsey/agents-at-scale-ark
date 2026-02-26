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
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, A2APayloadModeCompat, "agent/test", "completion-1", "agent", "default", "query", nil)
	require.NoError(t, err)

	assert.Contains(t, response.Content, "delta")
	foundArtifact := false
	foundStatus := false
	for _, chunk := range stream.chunks {
		wrapped, ok := chunk.(ChunkWithMetadata)
		if !ok || wrapped.Ark == nil {
			continue
		}
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

func TestStreamA2AAgentIntegrationNative(t *testing.T) {
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
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, A2APayloadModeNative, "agent/test", "completion-1", "agent", "default", "query", nil)
	require.NoError(t, err)

	assert.Contains(t, response.Content, "delta")
	foundArtifact := false
	foundStatus := false
	for _, chunk := range stream.chunks {
		if _, ok := chunk.(*protocol.TaskArtifactUpdateEvent); ok {
			foundArtifact = true
		}
		if status, ok := chunk.(*protocol.TaskStatusUpdateEvent); ok && status.Status.State == protocol.TaskStateWorking {
			foundStatus = true
		}
	}
	assert.True(t, foundArtifact)
	assert.True(t, foundStatus)
}
