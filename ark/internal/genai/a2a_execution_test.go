package genai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type fakeEventStream struct {
	chunks []interface{}
}

func (f *fakeEventStream) StreamChunk(_ context.Context, chunk interface{}) error {
	f.chunks = append(f.chunks, chunk)
	return nil
}

func (f *fakeEventStream) NotifyCompletion(_ context.Context) error {
	return nil
}

func (f *fakeEventStream) Close() error {
	return nil
}

func TestStreamA2AEventNative(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	payload := &protocol.Message{
		Kind: protocol.KindMessage,
		Role: protocol.MessageRoleAgent,
		Parts: []protocol.Part{
			protocol.TextPart{Kind: protocol.KindText, Text: "hello"},
		},
	}

	streamA2AEvent(ctx, stream, a2aPayloadModeNative, "agent/test", "completion-1", "hello", payload)

	assert.Len(t, stream.chunks, 1)
	assert.Equal(t, payload, stream.chunks[0])
}

func TestStreamA2AErrorNative(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}

	streamA2AError(ctx, stream, a2aPayloadModeNative, "agent/test", errors.New("boom"))

	assert.Len(t, stream.chunks, 1)
	message, ok := stream.chunks[0].(*protocol.Message)
	assert.True(t, ok)
	assert.Equal(t, protocol.KindMessage, message.Kind)
	assert.Equal(t, protocol.MessageRoleAgent, message.Role)
	assert.Equal(t, "boom", extractTextFromParts(message.Parts))
}

func TestConsumeA2AStreamEventsMessageCompat(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent, 1)
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.TextPart{Kind: protocol.KindText, Text: "hello"},
	})
	events <- protocol.StreamingMessageEvent{Result: &message}
	close(events)

	engine := &A2AExecutionEngine{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, a2aPayloadModeCompat, "agent/test", "completion-1", "agent", "default", "query", nil)

	assert.NoError(t, err)
	assert.Equal(t, "hello", response.Content)
	assert.Len(t, stream.chunks, 1)
	wrapped, ok := stream.chunks[0].(ChunkWithMetadata)
	assert.True(t, ok)
	assert.Equal(t, "hello", wrapped.ChatCompletionChunk.Choices[0].Delta.Content)
	assert.Equal(t, &message, wrapped.Ark.A2A)
}

func TestConsumeA2AStreamEventsArtifactUpdate(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent, 1)
	artifact := protocol.Artifact{
		ArtifactID: "artifact-1",
		Parts: []protocol.Part{
			protocol.TextPart{Kind: protocol.KindText, Text: "part-1"},
		},
	}
	events <- protocol.StreamingMessageEvent{Result: &protocol.TaskArtifactUpdateEvent{
		TaskID:    "task-1",
		ContextID: "context-1",
		Artifact:  artifact,
	}}
	close(events)

	engine := &A2AExecutionEngine{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, a2aPayloadModeCompat, "agent/test", "completion-1", "agent", "default", "query", nil)

	assert.NoError(t, err)
	assert.Equal(t, "part-1", response.Content)
	assert.Equal(t, "task-1", response.TaskID)
	assert.Equal(t, "context-1", response.ContextID)
}

func TestConsumeA2AStreamEventsFinalStatus(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent, 1)
	status := protocol.TaskStatus{
		State: protocol.TaskStateCompleted,
		Message: &protocol.Message{
			Parts: []protocol.Part{
				protocol.TextPart{Kind: protocol.KindText, Text: "done"},
			},
		},
	}
	events <- protocol.StreamingMessageEvent{Result: &protocol.TaskStatusUpdateEvent{
		TaskID:    "task-2",
		ContextID: "context-2",
		Status:    status,
		Final:     true,
	}}
	close(events)

	engine := &A2AExecutionEngine{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, a2aPayloadModeCompat, "agent/test", "completion-1", "agent", "default", "query", nil)

	assert.NoError(t, err)
	assert.Equal(t, "done", response.Content)
	assert.Equal(t, "task-2", response.TaskID)
	assert.Equal(t, "context-2", response.ContextID)
}

func TestConsumeA2AStreamEventsTaskHistory(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent, 1)
	task := &protocol.Task{
		ID:        "task-3",
		ContextID: "context-3",
		Status: protocol.TaskStatus{
			State: protocol.TaskStateCompleted,
		},
		History: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.TextPart{Kind: protocol.KindText, Text: "history"},
			}),
		},
	}
	events <- protocol.StreamingMessageEvent{Result: task}
	close(events)

	engine := &A2AExecutionEngine{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, a2aPayloadModeCompat, "agent/test", "completion-1", "agent", "default", "query", nil)

	assert.NoError(t, err)
	assert.Equal(t, "history", response.Content)
	assert.Equal(t, "task-3", response.TaskID)
	assert.Equal(t, "context-3", response.ContextID)
}

func TestConsumeA2AStreamEventsNoEvents(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent)
	close(events)

	engine := &A2AExecutionEngine{}
	_, err := engine.consumeA2AStreamEvents(ctx, events, stream, a2aPayloadModeCompat, "agent/test", "completion-1", "agent", "default", "query", nil)

	assert.Error(t, err)
}
