package completions

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
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

func TestConsumeA2AStreamEvents_IdleTimeout(t *testing.T) {
	a2aServer := &arkv1prealpha1.A2AServer{
		ObjectMeta: metav1.ObjectMeta{Name: "test-server", Namespace: "default"},
		Spec:       arkv1prealpha1.A2AServerSpec{Timeout: "50ms"},
	}
	events := make(chan protocol.StreamingMessageEvent)

	_, err := consumeA2AStreamEvents(context.Background(), nil, events, nil, "agent/test", "comp-1", "test", "default", "", a2aServer)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "idle timeout")
}

func TestConsumeA2AStreamEvents_IdleTimeoutReset(t *testing.T) {
	a2aServer := &arkv1prealpha1.A2AServer{
		ObjectMeta: metav1.ObjectMeta{Name: "test-server", Namespace: "default"},
		Spec:       arkv1prealpha1.A2AServerSpec{Timeout: "150ms"},
	}
	events := make(chan protocol.StreamingMessageEvent)
	stream := &mockEventStream{}

	go func() {
		for range 3 {
			time.Sleep(50 * time.Millisecond)
			events <- protocol.StreamingMessageEvent{
				Result: &protocol.Message{
					Role:  protocol.MessageRoleAgent,
					Parts: []protocol.Part{protocol.NewTextPart("chunk")},
				},
			}
		}
		close(events)
	}()

	result, err := consumeA2AStreamEvents(context.Background(), nil, events, stream, "agent/test", "comp-1", "test", "default", "", a2aServer)
	require.NoError(t, err)
	assert.Equal(t, "chunkchunkchunk", result.A2AResponse.Content)
	assert.Len(t, stream.chunks, 3)
}

func TestEffectiveIdleTimeout_Default(t *testing.T) {
	assert.Equal(t, defaultA2AStreamIdleTimeout, effectiveIdleTimeout(nil))
}

func TestEffectiveIdleTimeout_ServerTimeoutShorter(t *testing.T) {
	a2aServer := &arkv1prealpha1.A2AServer{
		Spec: arkv1prealpha1.A2AServerSpec{Timeout: "3m"},
	}
	assert.Equal(t, 3*time.Minute, effectiveIdleTimeout(a2aServer))
}

func TestEffectiveIdleTimeout_ServerTimeoutLonger(t *testing.T) {
	a2aServer := &arkv1prealpha1.A2AServer{
		Spec: arkv1prealpha1.A2AServerSpec{Timeout: "30m"},
	}
	assert.Equal(t, defaultA2AStreamIdleTimeout, effectiveIdleTimeout(a2aServer))
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
