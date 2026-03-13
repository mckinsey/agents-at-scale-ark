package completions

import (
	"context"
	"testing"

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

func TestConsumeA2AStreamEventsEmitsIncrementalChunks(t *testing.T) {
	ctx := context.Background()
	events := make(chan protocol.StreamingMessageEvent, 3)
	stream := &mockEventStream{}

	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskStatusUpdateEvent{
			TaskID:    "task-1",
			ContextID: "ctx-1",
			Status: protocol.TaskStatus{
				State: protocol.TaskState(arka2a.TaskStateWorking),
				Message: &protocol.Message{
					Parts: []protocol.Part{protocol.NewTextPart("first")},
				},
			},
		},
	}
	events <- protocol.StreamingMessageEvent{
		Result: &protocol.TaskArtifactUpdateEvent{
			TaskID: "task-1",
			Artifact: protocol.Artifact{
				Parts: []protocol.Part{protocol.NewTextPart("second")},
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
					Parts: []protocol.Part{protocol.NewTextPart("third")},
				},
			},
		},
	}

	result, err := consumeA2AStreamEvents(ctx, nil, events, stream, "model-1", "comp-1", "agent", "default", "", nil)
	require.NoError(t, err)
	assert.Equal(t, "second", result.A2AResponse.Content)
	require.Len(t, stream.chunks, 3)
	assert.Equal(t, "first", extractChunkContent(t, stream.chunks[0]))
	assert.Equal(t, "second", extractChunkContent(t, stream.chunks[1]))
	assert.Equal(t, "third", extractChunkContent(t, stream.chunks[2]))
}

func TestConsumeA2AStreamEventsWrapsOpenAIEnvelopeAndArkMetadata(t *testing.T) {
	ctx := WithQueryContext(context.Background(), "query-1", "session-1", "query-name")
	ctx = WithExecutionMetadata(ctx, map[string]interface{}{
		"target": "team/my-team",
		"team":   "my-team",
		"agent":  "research-agent",
	})

	events := make(chan protocol.StreamingMessageEvent, 1)
	stream := &mockEventStream{}

	events <- protocol.StreamingMessageEvent{
		Result: &protocol.Message{
			Role:  protocol.MessageRoleAgent,
			Parts: []protocol.Part{protocol.NewTextPart("hello")},
		},
	}
	close(events)

	_, err := consumeA2AStreamEvents(ctx, nil, events, stream, "model-1", "comp-1", "research-agent", "default", "", nil)
	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)

	chunkWithMeta, ok := stream.chunks[0].(ChunkWithMetadata)
	require.True(t, ok)
	require.NotNil(t, chunkWithMeta.ChatCompletionChunk)
	require.Len(t, chunkWithMeta.Choices, 1)
	assert.Equal(t, "hello", chunkWithMeta.Choices[0].Delta.Content)
	require.NotNil(t, chunkWithMeta.Ark)
	assert.Equal(t, "query-1", chunkWithMeta.Ark.Query)
	assert.Equal(t, "session-1", chunkWithMeta.Ark.Session)
	assert.Equal(t, "team/my-team", chunkWithMeta.Ark.Target)
	assert.Equal(t, "my-team", chunkWithMeta.Ark.Team)
	assert.Equal(t, "research-agent", chunkWithMeta.Ark.Agent)
	assert.Equal(t, "model-1", chunkWithMeta.Ark.Model)
}

func extractChunkContent(t *testing.T, chunk interface{}) string {
	t.Helper()

	switch c := chunk.(type) {
	case ChunkWithMetadata:
		require.NotNil(t, c.ChatCompletionChunk)
		require.NotEmpty(t, c.Choices)
		return c.Choices[0].Delta.Content
	case *ChunkWithMetadata:
		require.NotNil(t, c)
		require.NotNil(t, c.ChatCompletionChunk)
		require.NotEmpty(t, c.Choices)
		return c.Choices[0].Delta.Content
	default:
		t.Fatalf("unexpected chunk type %T", chunk)
		return ""
	}
}
