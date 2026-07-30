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

func boolPtr(b bool) *bool { return &b }

func strPtr(s string) *string { return &s }

func contentTexts(chunks []interface{}) []string {
	texts := make([]string, 0, len(chunks))
	for _, c := range chunks {
		cc, ok := c.(ChunkWithMetadata)
		if !ok || len(cc.Choices) == 0 {
			continue
		}
		if cc.Choices[0].FinishReason == finishReasonStop && cc.Choices[0].Delta.Content == "" {
			continue
		}
		texts = append(texts, cc.Choices[0].Delta.Content)
	}
	return texts
}

func boundaryCount(chunks []interface{}) int {
	n := 0
	for _, c := range chunks {
		cc, ok := c.(ChunkWithMetadata)
		if !ok || len(cc.Choices) == 0 {
			continue
		}
		if cc.Choices[0].FinishReason == finishReasonStop && cc.Choices[0].Delta.Content == "" {
			n++
		}
	}
	return n
}

func statusEvents(chunks []interface{}) []A2AStatusEvent {
	events := make([]A2AStatusEvent, 0, len(chunks))
	for _, c := range chunks {
		if se, ok := c.(A2AStatusEvent); ok {
			events = append(events, se)
		}
	}
	return events
}

func messageContents(messages []Message) []string {
	texts := make([]string, 0, len(messages))
	for _, m := range messages {
		if m.OfAssistant != nil {
			texts = append(texts, m.OfAssistant.Content.OfString.Value)
		}
	}
	return texts
}

func streamEvents(t *testing.T, results ...protocol.StreamingMessageResult) (*ExecutionResult, *mockEventStream, error) {
	t.Helper()
	events := make(chan protocol.StreamingMessageEvent, len(results))
	for _, r := range results {
		events <- protocol.StreamingMessageEvent{Result: r}
	}
	close(events)
	stream := &mockEventStream{}
	result, err := consumeA2AStreamEvents(context.Background(), nil, events, stream, "agent/test", "comp-1", "test", "default", "", nil)
	return result, stream, err
}

func TestConsumeA2AStreamEventsMessage(t *testing.T) {
	contextID := "ctx-1"
	result, stream, err := streamEvents(t, &protocol.Message{
		Role:      protocol.MessageRoleAgent,
		Parts:     []protocol.Part{protocol.NewTextPart("hello world")},
		ContextID: &contextID,
	})

	require.NoError(t, err)
	assert.Equal(t, "hello world", result.A2AResponse.Content)
	assert.Equal(t, []string{"hello world"}, result.A2AResponse.Messages)
	assert.Equal(t, "ctx-1", result.A2AResponse.ContextID)
	assert.Equal(t, []string{"hello world"}, messageContents(result.Messages))
	assert.Equal(t, []string{"hello world"}, contentTexts(stream.chunks))
}

func TestConsumeA2AStreamEventsSingleArtifactMultiChunk(t *testing.T) {
	result, stream, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID: "task-1",
			Append: boolPtr(false),
			Artifact: protocol.Artifact{
				ArtifactID: "a1",
				Parts:      []protocol.Part{protocol.NewTextPart("chunk 1")},
			},
		},
		&protocol.TaskArtifactUpdateEvent{
			TaskID: "task-1",
			Append: boolPtr(true),
			Artifact: protocol.Artifact{
				ArtifactID: "a1",
				Parts:      []protocol.Part{protocol.NewTextPart("chunk 2")},
			},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, "chunk 1chunk 2", result.A2AResponse.Content)
	assert.Equal(t, []string{"chunk 1chunk 2"}, result.A2AResponse.Messages)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
	assert.Equal(t, []string{"chunk 1chunk 2"}, messageContents(result.Messages))
	assert.Equal(t, 0, boundaryCount(stream.chunks))
}

func TestConsumeA2AStreamEventsArtifactAppendFalseReplaces(t *testing.T) {
	result, _, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("first")}},
		},
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Append:   boolPtr(false),
			Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("replacement")}},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, "replacement", result.A2AResponse.Content)
	assert.Equal(t, []string{"replacement"}, result.A2AResponse.Messages)
}

func TestConsumeA2AStreamEventsMultipleArtifactsSeparateMessages(t *testing.T) {
	result, stream, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("first answer")}},
		},
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a2", Parts: []protocol.Part{protocol.NewTextPart("second answer")}},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, []string{"first answer", "second answer"}, result.A2AResponse.Messages)
	assert.Equal(t, []string{"first answer", "second answer"}, messageContents(result.Messages))
	assert.Equal(t, "first answer\nsecond answer", result.A2AResponse.Content)
	assert.Equal(t, 1, boundaryCount(stream.chunks), "one boundary chunk between the two artifact bubbles")
}

func TestConsumeA2AStreamEventsSameNameArtifactsCollapse(t *testing.T) {
	result, _, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a1", Name: strPtr("report"), Parts: []protocol.Part{protocol.NewTextPart("v1")}},
		},
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a2", Name: strPtr("report"), Parts: []protocol.Part{protocol.NewTextPart("v2")}},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, []string{"v2"}, result.A2AResponse.Messages, "same-name artifacts collapse to the latest version")
}

func TestConsumeA2AStreamEventsNonTextArtifactExcluded(t *testing.T) {
	result, _, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "file-1", Parts: []protocol.Part{protocol.NewFilePartWithBytes("data.bin", "application/octet-stream", "YmluYXJ5")}},
		},
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "text-1", Parts: []protocol.Part{protocol.NewTextPart("the answer")}},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, []string{"the answer"}, result.A2AResponse.Messages, "file artifact excluded from reply, text artifact kept")
}

func TestConsumeA2AStreamEventsIntermediateStatusIsNotContent(t *testing.T) {
	result, stream, err := streamEvents(
		t,
		&protocol.TaskStatusUpdateEvent{
			TaskID:    "task-1",
			ContextID: "ctx-1",
			Status: protocol.TaskStatus{
				State:   protocol.TaskState(arka2a.TaskStateWorking),
				Message: &protocol.Message{Parts: []protocol.Part{protocol.NewTextPart("analyzing...")}},
			},
		},
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("final answer")}},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, []string{"final answer"}, result.A2AResponse.Messages)
	assert.Equal(t, "final answer", result.A2AResponse.Content)
	assert.NotContains(t, result.A2AResponse.Content, "analyzing")

	status := statusEvents(stream.chunks)
	require.Len(t, status, 1)
	assert.Equal(t, "a2a_status", status[0].Type)
	assert.Equal(t, "analyzing...", status[0].Message)
	assert.Equal(t, string(arka2a.TaskStateWorking), status[0].State)
	assert.NotContains(t, contentTexts(stream.chunks), "analyzing...")
}

func TestConsumeA2AStreamEventsFinalStatusOnly(t *testing.T) {
	result, stream, err := streamEvents(
		t,
		&protocol.TaskStatusUpdateEvent{
			TaskID:    "task-1",
			ContextID: "ctx-1",
			Status:    protocol.TaskStatus{State: protocol.TaskState(arka2a.TaskStateWorking)},
		},
		&protocol.TaskStatusUpdateEvent{
			TaskID:    "task-1",
			ContextID: "ctx-1",
			Final:     true,
			Status: protocol.TaskStatus{
				State:   protocol.TaskState(arka2a.TaskStateCompleted),
				Message: &protocol.Message{Parts: []protocol.Part{protocol.NewTextPart("done")}},
			},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, "done", result.A2AResponse.Content)
	assert.Equal(t, []string{"done"}, result.A2AResponse.Messages)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
	assert.Empty(t, contentTexts(stream.chunks), "final status text is not streamed as live content")
	assert.Len(t, statusEvents(stream.chunks), 1, "the non-final working update is emitted on the status channel")
}

func TestConsumeA2AStreamEventsArtifactsPreferredOverFinalStatus(t *testing.T) {
	result, _, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("artifact answer")}},
		},
		&protocol.TaskStatusUpdateEvent{
			TaskID: "task-1",
			Final:  true,
			Status: protocol.TaskStatus{
				State:   protocol.TaskState(arka2a.TaskStateCompleted),
				Message: &protocol.Message{Parts: []protocol.Part{protocol.NewTextPart("status summary")}},
			},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, []string{"artifact answer"}, result.A2AResponse.Messages, "artifacts win over the terminal status message")
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
	result, stream, err := streamEvents(t, &protocol.Task{
		ID:        "task-1",
		ContextID: "ctx-1",
		Status: protocol.TaskStatus{
			State:   protocol.TaskState(arka2a.TaskStateCompleted),
			Message: &protocol.Message{Parts: []protocol.Part{protocol.NewTextPart("task result")}},
		},
	})

	require.NoError(t, err)
	assert.Equal(t, "task result", result.A2AResponse.Content)
	assert.Equal(t, []string{"task result"}, result.A2AResponse.Messages)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
	assert.Empty(t, contentTexts(stream.chunks))
}

func TestConsumeA2AStreamEventsTaskDoesNotResetArtifacts(t *testing.T) {
	result, _, err := streamEvents(
		t,
		&protocol.TaskArtifactUpdateEvent{
			TaskID:   "task-1",
			Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("streamed artifact")}},
		},
		&protocol.Task{
			ID:        "task-1",
			ContextID: "ctx-1",
			Status:    protocol.TaskStatus{State: protocol.TaskState(arka2a.TaskStateWorking)},
		},
	)

	require.NoError(t, err)
	assert.Equal(t, []string{"streamed artifact"}, result.A2AResponse.Messages, "a working Task snapshot must not clobber accumulated artifacts")
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
	assert.Equal(t, []string{"chunk", "chunk", "chunk"}, contentTexts(stream.chunks))
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

func TestBuildMessagesFromA2AResponse(t *testing.T) {
	t.Run("multiple messages", func(t *testing.T) {
		resp := &arka2a.A2AResponse{Content: "a\nb", Messages: []string{"a", "b"}}
		assert.Equal(t, []string{"a", "b"}, messageContents(buildMessagesFromA2AResponse(resp)))
	})

	t.Run("falls back to content when no messages", func(t *testing.T) {
		resp := &arka2a.A2AResponse{Content: "only"}
		assert.Equal(t, []string{"only"}, messageContents(buildMessagesFromA2AResponse(resp)))
	})
}

func chunkRoles(chunks []interface{}) []string {
	roles := make([]string, 0, len(chunks))
	for _, c := range chunks {
		cc, ok := c.(ChunkWithMetadata)
		if !ok || len(cc.Choices) == 0 {
			continue
		}
		roles = append(roles, cc.Choices[0].Delta.Role)
	}
	return roles
}

func TestStreamBlockingA2AResponse(t *testing.T) {
	t.Run("streams each message as its own assistant chunk", func(t *testing.T) {
		stream := &mockEventStream{}
		resp := &arka2a.A2AResponse{Content: "first\nsecond", Messages: []string{"first", "second"}}

		streamBlockingA2AResponse(context.Background(), stream, resp, "agent/test")

		assert.Equal(t, []string{"first", "second"}, contentTexts(stream.chunks))
		assert.Equal(t, []string{RoleAssistant, RoleAssistant}, chunkRoles(stream.chunks))
		for _, c := range stream.chunks {
			cc := c.(ChunkWithMetadata)
			assert.Equal(t, finishReasonStop, cc.Choices[0].FinishReason)
		}
	})

	t.Run("falls back to content when there are no messages", func(t *testing.T) {
		stream := &mockEventStream{}
		resp := &arka2a.A2AResponse{Content: "only answer"}

		streamBlockingA2AResponse(context.Background(), stream, resp, "agent/test")

		assert.Equal(t, []string{"only answer"}, contentTexts(stream.chunks))
	})
}

func TestConsumeA2AStreamEventsTaskWithArtifacts(t *testing.T) {
	result, _, err := streamEvents(t, &protocol.Task{
		ID:        "task-1",
		ContextID: "ctx-1",
		Status:    protocol.TaskStatus{State: protocol.TaskState(arka2a.TaskStateCompleted)},
		Artifacts: []protocol.Artifact{
			{ArtifactID: "a1", Name: strPtr("report"), Parts: []protocol.Part{protocol.NewTextPart("artifact answer")}},
			{ArtifactID: "a2", Parts: []protocol.Part{protocol.NewFilePartWithBytes("data.bin", "application/octet-stream", "YmluYXJ5")}},
		},
	})

	require.NoError(t, err)
	assert.Equal(t, []string{"artifact answer"}, result.A2AResponse.Messages, "text artifact kept, file artifact excluded")
	assert.Equal(t, "artifact answer", result.A2AResponse.Content)
	assert.Equal(t, "task-1", result.A2AResponse.TaskID)
}

func TestConsumeA2AStreamEventsTaskArtifactsPreferredOverStatusMessage(t *testing.T) {
	result, _, err := streamEvents(t, &protocol.Task{
		ID:        "task-1",
		ContextID: "ctx-1",
		Status: protocol.TaskStatus{
			State:   protocol.TaskState(arka2a.TaskStateCompleted),
			Message: &protocol.Message{Parts: []protocol.Part{protocol.NewTextPart("status summary")}},
		},
		Artifacts: []protocol.Artifact{
			{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("artifact answer")}},
		},
	})

	require.NoError(t, err)
	assert.Equal(t, []string{"artifact answer"}, result.A2AResponse.Messages, "artifacts win over the terminal status message on a Task snapshot")
}
