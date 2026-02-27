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

type failingA2AEventStream struct {
	callCount  int
	failOnCall int
}

func (f *failingA2AEventStream) StreamChunk(_ context.Context, _ interface{}) error {
	f.callCount++
	if f.callCount == f.failOnCall {
		return errors.New("stream boom")
	}
	return nil
}

func (f *failingA2AEventStream) NotifyCompletion(_ context.Context) error {
	return nil
}

func (f *failingA2AEventStream) Close() error {
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

	err := streamA2AEvent(ctx, stream, payload)

	assert.NoError(t, err)
	assert.Len(t, stream.chunks, 1)
	assert.Equal(t, payload, stream.chunks[0])
}

func TestStreamA2AEventFailure(t *testing.T) {
	ctx := context.Background()
	stream := &failingA2AEventStream{failOnCall: 1}
	payload := &protocol.Message{
		Kind: protocol.KindMessage,
		Role: protocol.MessageRoleAgent,
		Parts: []protocol.Part{
			protocol.TextPart{Kind: protocol.KindText, Text: "hello"},
		},
	}

	err := streamA2AEvent(ctx, stream, payload)

	assert.Error(t, err)
	assert.ErrorContains(t, err, "failed to stream A2A event")
}

func TestStreamA2AError(t *testing.T) {
	ctx := context.Background()
	ctx = WithA2AContextID(ctx, "ctx-err")
	ctx = WithQueryContext(ctx, "query-err", "session-1", "query-name")
	stream := &fakeEventStream{}

	streamA2AError(ctx, stream, "agent/test", errors.New("boom"))

	assert.Len(t, stream.chunks, 1)
	event, ok := stream.chunks[0].(*protocol.TaskStatusUpdateEvent)
	assert.True(t, ok)
	assert.Equal(t, protocol.TaskStateFailed, event.Status.State)
	assert.True(t, event.Final)
	assert.Equal(t, "ctx-err", event.ContextID)
	assert.NotNil(t, event.Status.Message)
	assert.Equal(t, "boom", extractTextFromParts(event.Status.Message.Parts))
	stepPayload, hasStepPayload := extractDataPayloadBySchema(
		event.Status.Message.Parts,
		A2APayloadSchemaStepEventV1,
	)
	assert.True(t, hasStepPayload)
	assert.Equal(t, "task-error:query-err", stepPayload["stepId"])
	assert.Equal(t, "error", stepPayload["stepState"])
	assert.Equal(t, "status", stepPayload["stepKind"])
}

func TestConsumeA2AStreamEventsMessage(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent, 1)
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.TextPart{Kind: protocol.KindText, Text: "hello"},
	})
	events <- protocol.StreamingMessageEvent{Result: &message}
	close(events)

	engine := &A2AExecutionEngine{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

	assert.NoError(t, err)
	assert.Equal(t, "hello", response.Content)
	assert.Len(t, stream.chunks, 1)
	streamedMessage, ok := stream.chunks[0].(*protocol.Message)
	assert.True(t, ok)
	assert.Equal(t, "hello", extractTextFromParts(streamedMessage.Parts))
}

func TestConsumeA2AStreamEventsMessageThenFinalStatus(t *testing.T) {
	ctx := context.Background()
	stream := &fakeEventStream{}
	events := make(chan protocol.StreamingMessageEvent, 2)

	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.TextPart{Kind: protocol.KindText, Text: "partial"},
	})
	events <- protocol.StreamingMessageEvent{Result: &message}

	status := protocol.TaskStatus{
		State: protocol.TaskStateCompleted,
		Message: &protocol.Message{
			Parts: []protocol.Part{
				protocol.TextPart{Kind: protocol.KindText, Text: "done"},
			},
		},
	}
	events <- protocol.StreamingMessageEvent{Result: &protocol.TaskStatusUpdateEvent{
		TaskID:    "task-seq",
		ContextID: "context-seq",
		Status:    status,
		Final:     true,
	}}
	close(events)

	engine := &A2AExecutionEngine{}
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

	assert.NoError(t, err)
	assert.Equal(t, "partial", response.Content)
	assert.Equal(t, "task-seq", response.TaskID)
	assert.Equal(t, "context-seq", response.ContextID)
	assert.NotNil(t, response.Message)
	assert.Equal(t, "done", extractTextFromParts(response.Message.Parts))
	assert.Len(t, stream.chunks, 2)
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
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

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
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

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
	response, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

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
	_, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

	assert.Error(t, err)
}

func TestConsumeA2AStreamEventsMessageStreamFailure(t *testing.T) {
	ctx := context.Background()
	stream := &failingA2AEventStream{failOnCall: 1}
	events := make(chan protocol.StreamingMessageEvent, 1)
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.TextPart{Kind: protocol.KindText, Text: "hello"},
	})
	events <- protocol.StreamingMessageEvent{Result: &message}
	close(events)

	engine := &A2AExecutionEngine{}
	_, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

	assert.Error(t, err)
	assert.ErrorContains(t, err, "failed to stream A2A event")
}

func TestConsumeA2AStreamEventsStatusStreamFailure(t *testing.T) {
	ctx := context.Background()
	stream := &failingA2AEventStream{failOnCall: 1}
	events := make(chan protocol.StreamingMessageEvent, 1)
	status := protocol.TaskStatus{
		State: protocol.TaskStateWorking,
	}
	events <- protocol.StreamingMessageEvent{Result: &protocol.TaskStatusUpdateEvent{
		TaskID:    "task-1",
		ContextID: "context-1",
		Status:    status,
		Final:     false,
	}}
	close(events)

	engine := &A2AExecutionEngine{}
	_, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

	assert.Error(t, err)
	assert.ErrorContains(t, err, "failed to stream A2A event")
}

func TestConsumeA2AStreamEventsArtifactStreamFailure(t *testing.T) {
	ctx := context.Background()
	stream := &failingA2AEventStream{failOnCall: 1}
	events := make(chan protocol.StreamingMessageEvent, 1)
	events <- protocol.StreamingMessageEvent{Result: &protocol.TaskArtifactUpdateEvent{
		TaskID:    "task-1",
		ContextID: "context-1",
		Artifact: protocol.Artifact{
			ArtifactID: "artifact-1",
			Parts: []protocol.Part{
				protocol.TextPart{Kind: protocol.KindText, Text: "artifact-part"},
			},
		},
	}}
	close(events)

	engine := &A2AExecutionEngine{}
	_, err := engine.consumeA2AStreamEvents(ctx, events, stream, "agent", "default", "query", nil)

	assert.Error(t, err)
	assert.ErrorContains(t, err, "failed to stream A2A event")
}
