package completions

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type capturingEventStream struct {
	chunks       []interface{}
	failOnStream error
}

func (s *capturingEventStream) StreamChunk(_ context.Context, chunk interface{}) error {
	if s.failOnStream != nil {
		return s.failOnStream
	}
	s.chunks = append(s.chunks, chunk)
	return nil
}

func (s *capturingEventStream) NotifyCompletion(_ context.Context) error { return nil }
func (s *capturingEventStream) Close() error                             { return nil }

func TestStreamApprovalRequest(t *testing.T) {
	ctx := context.Background()
	toolCalls := []ToolCall{{ID: "c1"}}
	config := &arkv1alpha1.ToolApprovalConfig{
		Timeout:   &metav1.Duration{Duration: 5 * 60 * 1e9}, // 5 minutes in ns
		OnTimeout: "reject",
	}

	t.Run("no-op when stream is nil", func(t *testing.T) {
		StreamApprovalRequest(ctx, nil, "task-1", toolCalls, config, "agent")
	})

	t.Run("emits ToolApprovalRequestEvent on stream", func(t *testing.T) {
		stream := &capturingEventStream{}
		StreamApprovalRequest(ctx, stream, "task-1", toolCalls, config, "deploy-agent")
		require.Len(t, stream.chunks, 1)
		event, ok := stream.chunks[0].(ToolApprovalRequestEvent)
		require.True(t, ok)
		assert.Equal(t, "tool_approval_request", event.Type)
		assert.Equal(t, "task-1", event.TaskID)
		assert.Equal(t, "deploy-agent", event.AgentName)
		assert.Equal(t, "reject", event.OnTimeout)
		assert.NotEmpty(t, event.Timeout)
	})

	t.Run("omits timeout when not set", func(t *testing.T) {
		stream := &capturingEventStream{}
		noTimeoutConfig := &arkv1alpha1.ToolApprovalConfig{OnTimeout: "proceed"}
		StreamApprovalRequest(ctx, stream, "task-2", toolCalls, noTimeoutConfig, "agent")
		require.Len(t, stream.chunks, 1)
		event := stream.chunks[0].(ToolApprovalRequestEvent)
		assert.Empty(t, event.Timeout)
	})

	t.Run("logs but does not panic on stream failure", func(t *testing.T) {
		stream := &capturingEventStream{failOnStream: fmt.Errorf("stream broken")}
		StreamApprovalRequest(ctx, stream, "task-1", toolCalls, config, "agent")
	})
}

func TestStreamApprovalResponse(t *testing.T) {
	ctx := context.Background()

	t.Run("no-op when stream is nil", func(t *testing.T) {
		StreamApprovalResponse(ctx, nil, "task-1", "approved")
	})

	t.Run("emits approved response event", func(t *testing.T) {
		stream := &capturingEventStream{}
		StreamApprovalResponse(ctx, stream, "task-1", "approved")
		require.Len(t, stream.chunks, 1)
		event, ok := stream.chunks[0].(ToolApprovalResponseEvent)
		require.True(t, ok)
		assert.Equal(t, "tool_approval_response", event.Type)
		assert.Equal(t, "task-1", event.TaskID)
		assert.Equal(t, "approved", event.Action)
		assert.NotEmpty(t, event.Timestamp)
	})

	t.Run("emits rejected response event", func(t *testing.T) {
		stream := &capturingEventStream{}
		StreamApprovalResponse(ctx, stream, "task-2", "rejected")
		require.Len(t, stream.chunks, 1)
		event := stream.chunks[0].(ToolApprovalResponseEvent)
		assert.Equal(t, "rejected", event.Action)
	})
}

func TestWrapErrorWithMetadata(t *testing.T) {
	ctx := context.Background()
	streamErr := &StreamingError{}
	streamErr.Error.Message = "boom"
	streamErr.Error.Type = "server_error"

	wrapped := WrapErrorWithMetadata(ctx, streamErr, "gpt-4o")
	ewm, ok := wrapped.(ErrorWithMetadata)
	require.True(t, ok)
	assert.Equal(t, streamErr, ewm.StreamingError)
	assert.NotNil(t, ewm.Ark)
}
