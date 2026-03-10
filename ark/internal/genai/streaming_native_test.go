package genai

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestBuildNativeStreamCompletionEventNilQuery(t *testing.T) {
	ctx := WithQueryContext(context.Background(), "query-1", "session-1", "query-name")
	ctx = WithA2AContextID(ctx, "ctx-1")

	event := BuildNativeStreamCompletionEvent(ctx, nil)
	require.NotNil(t, event)
	assert.Equal(t, "query-1", event.TaskID)
	assert.Equal(t, "ctx-1", event.ContextID)
	assert.True(t, event.Final)
	assert.Equal(t, protocol.TaskStateCompleted, event.Status.State)
	require.NotNil(t, event.Status.Message)
	assert.Equal(t, "", extractTextFromParts(event.Status.Message.Parts))
	assert.Empty(t, event.Metadata)
}

func TestBuildNativeStreamCompletionEventErrorPhase(t *testing.T) {
	ctx := WithQueryContext(context.Background(), "query-2", "session-1", "query-name")
	ctx = WithA2AContextID(ctx, "ctx-2")

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			UID: types.UID("query-uid"),
		},
		Status: arkv1alpha1.QueryStatus{
			Phase: "error",
			Response: &arkv1alpha1.Response{
				Content: "query failed",
				Phase:   "error",
			},
		},
	}

	event := BuildNativeStreamCompletionEvent(ctx, query)
	require.NotNil(t, event)
	assert.Equal(t, protocol.TaskStateFailed, event.Status.State)
	require.NotNil(t, event.Status.Message)
	assert.Equal(t, "query failed", extractTextFromParts(event.Status.Message.Parts))
	assert.Equal(t, "error", event.Metadata["phase"])
	assert.Equal(t, "query-uid", event.Metadata["query"])
}

func TestBuildNativeStreamCompletionEventSuccessWithUsageAndA2A(t *testing.T) {
	ctx := WithQueryContext(context.Background(), "query-3", "session-1", "query-name")
	ctx = WithA2AContextID(ctx, "ctx-3")

	duration := metav1.Duration{Duration: 5 * time.Second}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			UID: types.UID("query-uid-2"),
		},
		Status: arkv1alpha1.QueryStatus{
			Phase: "done",
			Response: &arkv1alpha1.Response{
				Content: "all done",
				Phase:   "done",
				A2A: &arkv1alpha1.A2AMetadata{
					ContextID: "ctx-response",
					TaskID:    "task-response",
				},
			},
			TokenUsage: arkv1alpha1.TokenUsage{
				PromptTokens:     10,
				CompletionTokens: 20,
				TotalTokens:      30,
			},
			Duration: &duration,
		},
	}

	event := BuildNativeStreamCompletionEvent(ctx, query)
	require.NotNil(t, event)
	assert.Equal(t, protocol.TaskStateCompleted, event.Status.State)
	require.NotNil(t, event.Status.Message)
	assert.Equal(t, "all done", extractTextFromParts(event.Status.Message.Parts))

	usage, ok := event.Metadata["usage"].(map[string]int64)
	require.True(t, ok)
	assert.Equal(t, int64(10), usage["promptTokens"])
	assert.Equal(t, int64(20), usage["completionTokens"])
	assert.Equal(t, int64(30), usage["totalTokens"])

	a2aMetadata, ok := event.Metadata["a2a"].(*arkv1alpha1.A2AMetadata)
	require.True(t, ok)
	assert.Equal(t, "ctx-response", a2aMetadata.ContextID)
	assert.Equal(t, "task-response", a2aMetadata.TaskID)
	assert.Equal(t, "5s", event.Metadata["duration"])
}
