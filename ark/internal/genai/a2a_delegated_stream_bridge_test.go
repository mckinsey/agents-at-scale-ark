package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestDelegatedStreamBridgeNilBaseReturnsNil(t *testing.T) {
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-1"}
	bridge := newDelegatedToolStreamBridge(nil, ext)
	assert.Nil(t, bridge)
}

func TestDelegatedStreamBridgeTaskStatusUpdateEvent(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{
		ToolCallID: "tc-1",
		ToolName:   "lookup",
		StepID:     "step-1",
	}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("working")})
	evt := &protocol.TaskStatusUpdateEvent{
		Kind:      "status-update",
		TaskID:    "delegated-task-1",
		ContextID: "ctx-1",
		Status:    protocol.TaskStatus{State: protocol.TaskStateWorking, Message: &msg},
	}

	err := bridge.StreamChunk(context.Background(), evt)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)

	forwarded := stream.chunks[0].(*protocol.TaskStatusUpdateEvent)
	assert.Equal(t, protocol.TaskStateWorking, forwarded.Status.State)
	require.NotNil(t, forwarded.Status.Message)

	payload := findStepEventPayload(t, forwarded.Status.Message.Parts)
	assert.Equal(t, "tc-1", payload.ToolCallID)
	assert.Equal(t, "lookup", payload.ToolName)
	assert.Equal(t, "delegated-task-1", payload.DelegatedTaskID)
	assert.Equal(t, "ctx-1", payload.DelegatedContextID)
}

func TestDelegatedStreamBridgeTaskArtifactUpdateEvent(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-2", ToolName: "search"}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	evt := &protocol.TaskArtifactUpdateEvent{
		Kind:      "artifact-update",
		TaskID:    "task-2",
		ContextID: "ctx-2",
		Artifact: protocol.Artifact{
			ArtifactID: "a1",
			Parts:      []protocol.Part{protocol.NewTextPart("token")},
		},
	}

	err := bridge.StreamChunk(context.Background(), evt)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)

	forwarded := stream.chunks[0].(*protocol.TaskArtifactUpdateEvent)
	assert.Equal(t, "task-2", forwarded.TaskID)
	payload := findStepEventPayload(t, forwarded.Artifact.Parts)
	assert.Equal(t, "tc-2", payload.ToolCallID)
	assert.Equal(t, "task-2", payload.DelegatedTaskID)
}

func TestDelegatedStreamBridgeMessagePointer(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-3"}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("hello")})
	err := bridge.StreamChunk(context.Background(), &msg)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)

	forwarded := stream.chunks[0].(*protocol.Message)
	payload := findStepEventPayload(t, forwarded.Parts)
	assert.Equal(t, "tc-3", payload.ToolCallID)
}

func TestDelegatedStreamBridgeMessageValue(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-4"}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("hello")})
	err := bridge.StreamChunk(context.Background(), msg)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)
}

func TestDelegatedStreamBridgeTask(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-5"}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("done")})
	task := &protocol.Task{
		ID:        "task-5",
		ContextID: "ctx-5",
		Status:    protocol.TaskStatus{State: protocol.TaskStateCompleted, Message: &msg},
	}

	err := bridge.StreamChunk(context.Background(), task)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)

	forwarded := stream.chunks[0].(*protocol.Task)
	assert.Equal(t, "task-5", forwarded.ID)
	payload := findStepEventPayload(t, forwarded.Status.Message.Parts)
	assert.Equal(t, "tc-5", payload.ToolCallID)
	assert.Equal(t, "task-5", payload.DelegatedTaskID)
	assert.Equal(t, "ctx-5", payload.DelegatedContextID)
}

func TestDelegatedStreamBridgeSequenceIncrementsAcrossEvents(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-seq"}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	for i := 0; i < 3; i++ {
		evt := &protocol.TaskArtifactUpdateEvent{
			Kind:   "artifact-update",
			TaskID: "task-seq",
			Artifact: protocol.Artifact{
				ArtifactID: "a1",
				Parts:      []protocol.Part{protocol.NewTextPart("token")},
			},
		}
		require.NoError(t, bridge.StreamChunk(context.Background(), evt))
	}

	require.Len(t, stream.chunks, 3)
	for i, chunk := range stream.chunks {
		forwarded := chunk.(*protocol.TaskArtifactUpdateEvent)
		payload := findStepEventPayload(t, forwarded.Artifact.Parts)
		require.NotNil(t, payload.Sequence, "event %d should have sequence", i)
		assert.Equal(t, i+1, *payload.Sequence, "sequence should increment from 1")
	}
}

func TestDelegatedStreamBridgeUnknownTypePassthrough(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{ToolCallID: "tc-unknown"}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	unknownChunk := "raw-string-chunk"
	err := bridge.StreamChunk(context.Background(), unknownChunk)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)
	assert.Equal(t, "raw-string-chunk", stream.chunks[0])
}

func TestDelegatedStreamBridgeNotifyCompletionDelegates(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	err := bridge.NotifyCompletion(context.Background())
	assert.NoError(t, err)
}

func TestDelegatedStreamBridgeCloseDelegates(t *testing.T) {
	stream := &fakeEventStream{}
	ext := A2ADelegatedToolExtension{}
	bridge := newDelegatedToolStreamBridge(stream, ext)

	err := bridge.Close()
	assert.NoError(t, err)
}

func findStepEventPayload(t *testing.T, parts []protocol.Part) StepEventPayloadV1 {
	t.Helper()
	for _, part := range parts {
		dp, ok := part.(*protocol.DataPart)
		if !ok {
			continue
		}
		if payload, ok := dp.Data.(StepEventPayloadV1); ok {
			return payload
		}
	}
	t.Fatal("no StepEventPayloadV1 found in parts")
	return StepEventPayloadV1{}
}
