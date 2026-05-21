package completions

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arka2a "mckinsey.com/ark/internal/a2a"
)

type mockEventStream struct {
	chunks []interface{}
}

func (m *mockEventStream) StreamChunk(_ context.Context, chunk interface{}) error {
	m.chunks = append(m.chunks, chunk)
	return nil
}

func (m *mockEventStream) NotifyCompletion(_ context.Context) error { return nil }
func (m *mockEventStream) Close() error                             { return nil }

func TestConsumeA2AStreamEventsMessage(t *testing.T) {
	ctx := context.Background()
	events := make(chan protocol.StreamingMessageEvent, 1)
	stream := &mockEventStream{}

	contextID := "ctx-1"
	events <- protocol.StreamingMessageEvent{
		Result: &protocol.Message{
			Role:      protocol.MessageRoleAgent,
			Parts:     []protocol.Part{protocol.NewTextPart("hello world")},
			ContextID: &contextID,
		},
	}
	close(events)

	result, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "hello world", result.A2AResponse.Content)
	assert.Equal(t, "ctx-1", result.A2AResponse.ContextID)
	assert.Len(t, stream.chunks, 1)
}

func TestConsumeA2AStreamEventsArtifact(t *testing.T) {
	ctx := context.Background()
	events := make(chan protocol.StreamingMessageEvent, 2)
	stream := &mockEventStream{}

	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskArtifactUpdateEvent{
			TaskID: "task-1",
			Artifact: protocol.Artifact{
				Parts: []protocol.Part{protocol.NewTextPart("chunk 1")},
			},
		},
	}
	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskArtifactUpdateEvent{
			TaskID: "task-1",
			Artifact: protocol.Artifact{
				Parts: []protocol.Part{protocol.NewTextPart("chunk 2")},
			},
		},
	}
	close(events)

	result, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "chunk 1chunk 2", result.A2AResponse.Content)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
	assert.Len(t, stream.chunks, 2)
}

func TestConsumeA2AStreamEventsFinalStatus(t *testing.T) {
	ctx := context.Background()
	events := make(chan protocol.StreamingMessageEvent, 2)
	stream := &mockEventStream{}

	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskStatusUpdateEvent{
			TaskID:    "task-1",
			ContextID: "ctx-1",
			Status: protocol.TaskStatus{
				State: protocol.TaskState(arka2a.TaskStateWorking),
			},
		},
	}
	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskStatusUpdateEvent{
			TaskID:    "task-1",
			ContextID: "ctx-1",
			Final:     true,
			Status: protocol.TaskStatus{
				State: protocol.TaskState(arka2a.TaskStateCompleted),
				Message: &protocol.Message{
					Parts: []protocol.Part{protocol.NewTextPart("done")},
				},
			},
		},
	}

	result, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "done", result.A2AResponse.Content)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
	assert.Len(t, stream.chunks, 1)
}

func TestConsumeA2AStreamEventsNoEvents(t *testing.T) {
	ctx := context.Background()
	events := make(chan protocol.StreamingMessageEvent)
	close(events)

	_, err := consumeA2AStreamEvents(ctx, nil, events, nil, "agent/test", "comp-1", "test", "default", "", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no events")
}

func TestConsumeA2AStreamEventsTask(t *testing.T) {
	ctx := context.Background()
	events := make(chan protocol.StreamingMessageEvent, 1)
	stream := &mockEventStream{}

	events <- protocol.StreamingMessageEvent{
		Result: &protocol.Task{
			ID:        "task-1",
			ContextID: "ctx-1",
			Status: protocol.TaskStatus{
				State: protocol.TaskState(arka2a.TaskStateCompleted),
				Message: &protocol.Message{
					Parts: []protocol.Part{protocol.NewTextPart("task result")},
				},
			},
		},
	}
	close(events)

	result, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "task result", result.A2AResponse.Content)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
	assert.Len(t, stream.chunks, 1)
}

func TestStreamContentChunkSkipsEmpty(t *testing.T) {
	ctx := context.Background()
	stream := &mockEventStream{}

	streamContentChunk(ctx, stream, "comp-1", "model-1", "")
	assert.Empty(t, stream.chunks)

	streamContentChunk(ctx, nil, "comp-1", "model-1", "hello")
	assert.Empty(t, stream.chunks)

	streamContentChunk(ctx, stream, "comp-1", "model-1", "hello")
	assert.Len(t, stream.chunks, 1)
}

func TestExtractTextFromTaskStatus(t *testing.T) {
	t.Run("from status message", func(t *testing.T) {
		task := &protocol.Task{
			Status: protocol.TaskStatus{
				State: protocol.TaskState(arka2a.TaskStateCompleted),
				Message: &protocol.Message{
					Parts: []protocol.Part{protocol.NewTextPart("from status")},
				},
			},
		}
		assert.Equal(t, "from status", extractTextFromTaskStatus(task))
	})

	t.Run("from history fallback", func(t *testing.T) {
		task := &protocol.Task{
			Status: protocol.TaskStatus{
				State: protocol.TaskState(arka2a.TaskStateCompleted),
			},
			History: []protocol.Message{
				{Role: protocol.MessageRoleAgent, Parts: []protocol.Part{protocol.NewTextPart("from history")}},
			},
		}
		assert.Equal(t, "from history", extractTextFromTaskStatus(task))
	})

	t.Run("empty task", func(t *testing.T) {
		task := &protocol.Task{
			Status: protocol.TaskStatus{State: protocol.TaskState(arka2a.TaskStateWorking)},
		}
		assert.Equal(t, "", extractTextFromTaskStatus(task))
	})
}

func TestConsumeA2AStreamEventsContextCanceled(t *testing.T) {
	// Create a context that is already canceled
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	events := make(chan protocol.StreamingMessageEvent, 1)
	stream := &mockEventStream{}

	// consumeA2AStreamEvents should return immediately with context.Canceled error
	_, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestConsumeA2AStreamEventsContextDeadlineExceeded(t *testing.T) {
	// Create a context with an already-passed deadline
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-1*time.Second))
	defer cancel()

	events := make(chan protocol.StreamingMessageEvent, 1)
	stream := &mockEventStream{}

	// consumeA2AStreamEvents should return immediately with context.DeadlineExceeded error
	_, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.Error(t, err)
	assert.ErrorIs(t, err, context.DeadlineExceeded)
}

func TestConsumeA2AStreamEventsPartialContentBeforeCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	events := make(chan protocol.StreamingMessageEvent, 1)
	stream := &mockEventStream{}

	// Send one event then cancel the context
	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskArtifactUpdateEvent{
			TaskID: "task-1",
			Artifact: protocol.Artifact{
				Parts: []protocol.Part{protocol.NewTextPart("partial content")},
			},
		},
	}
	cancel()

	// consumeA2AStreamEvents should return context.Canceled
	// The partial content was received but the stream was interrupted
	_, err := consumeA2AStreamEvents(ctx, nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
	// Verify that the partial chunk was streamed before cancellation
	assert.Len(t, stream.chunks, 1)
}
