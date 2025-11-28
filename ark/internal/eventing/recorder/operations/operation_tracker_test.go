package operations

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"

	"mckinsey.com/ark/internal/eventing/mock"
)

func TestOperationTracker_InitializeQueryContext(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "test-ns",
			UID:       types.UID("test-uid"),
		},
		Spec: arkv1alpha1.QuerySpec{
			SessionId: "session-123",
		},
	}

	ctx := ot.InitializeQueryContext(context.Background(), query)

	qd := ot.GetQueryDetails(ctx)
	assert.NotNil(t, qd)
	assert.Equal(t, "test-query", qd.QueryName)
	assert.Equal(t, "test-ns", qd.Namespace)
	assert.Equal(t, "test-uid", qd.QueryID)
	assert.Equal(t, "session-123", qd.SessionID)
	assert.Equal(t, query, qd.Query)
}

func TestOperationTracker_InitializeQueryContext_NoSessionID(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "test-ns",
			UID:       types.UID("test-uid"),
		},
		Spec: arkv1alpha1.QuerySpec{},
	}

	ctx := ot.InitializeQueryContext(context.Background(), query)

	qd := ot.GetQueryDetails(ctx)
	assert.NotNil(t, qd)
	assert.Equal(t, "test-uid", qd.SessionID)
}

func TestOperationTracker_GetQueryDetails_NoContext(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	qd := ot.GetQueryDetails(context.Background())
	assert.Nil(t, qd)
}

func TestOperationTracker_GetQueryDetails_WrongType(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	ctx := context.WithValue(context.Background(), queryDetailsKey, "invalid")

	qd := ot.GetQueryDetails(ctx)
	assert.Nil(t, qd)
}

func TestOperationTracker_Start(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "test-ns",
			UID:       types.UID("test-uid"),
		},
		Spec: arkv1alpha1.QuerySpec{
			SessionId: "session-123",
		},
	}

	ctx := ot.InitializeQueryContext(context.Background(), query)
	operationData := map[string]string{
		"agentName": "test-agent",
	}

	_ = ot.Start(ctx, "TestOperation", "Starting test operation", operationData)

	events := emitter.GetEvents()
	assert.Equal(t, 1, len(events))
	event := events[0]
	assert.Equal(t, query, event.Object)
	assert.Equal(t, "TestOperationStart", event.Reason)
	assert.Contains(t, event.Message, "Starting test operation")
	assert.Contains(t, event.Message, "timestamp:")

	assert.NotNil(t, event.Data)
	data, ok := (*event.Data).(map[string]string)
	assert.True(t, ok)
	assert.Equal(t, "test-uid", data["queryId"])
	assert.Equal(t, "test-query", data["queryName"])
	assert.Equal(t, "test-ns", data["queryNamespace"])
	assert.Equal(t, "session-123", data["sessionId"])
	assert.Equal(t, "test-agent", data["agentName"])
	assert.Contains(t, data, "timestamp")
	assert.Contains(t, data, "message")
}

func TestOperationTracker_Start_NoQueryContext(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	ctx := ot.Start(context.Background(), "TestOperation", "Starting test operation", nil)

	assert.NotNil(t, ctx)
	assert.Equal(t, 0, emitter.EventCount())
}

func TestOperationTracker_Complete(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "test-ns",
			UID:       types.UID("test-uid"),
		},
		Spec: arkv1alpha1.QuerySpec{
			SessionId: "session-123",
		},
	}

	ctx := ot.InitializeQueryContext(context.Background(), query)
	ctx = ot.Start(ctx, "TestOperation", "Starting test operation", nil)

	time.Sleep(10 * time.Millisecond)

	completionData := map[string]string{
		"result": "success",
	}
	ot.Complete(ctx, "TestOperation", "Completed test operation", completionData)

	events := emitter.GetEvents()
	assert.Equal(t, 2, len(events))
	event := events[1]
	assert.Equal(t, query, event.Object)
	assert.Equal(t, "TestOperationComplete", event.Reason)
	assert.Contains(t, event.Message, "Completed test operation")

	assert.NotNil(t, event.Data)
	data, ok := (*event.Data).(map[string]string)
	assert.True(t, ok)
	assert.Equal(t, "success", data["result"])
	assert.Contains(t, data, "durationMs")
	assert.Contains(t, data, "timestamp")
}

func TestOperationTracker_Complete_NoQueryContext(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	ot.Complete(context.Background(), "TestOperation", "Completed test operation", nil)

	assert.Equal(t, 0, emitter.EventCount())
}

func TestOperationTracker_Fail(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "test-ns",
			UID:       types.UID("test-uid"),
		},
		Spec: arkv1alpha1.QuerySpec{
			SessionId: "session-123",
		},
	}

	ctx := ot.InitializeQueryContext(context.Background(), query)
	ctx = ot.Start(ctx, "TestOperation", "Starting test operation", nil)

	time.Sleep(10 * time.Millisecond)

	failureErr := errors.New("test error")
	failureData := map[string]string{
		"component": "test-component",
	}
	ot.Fail(ctx, "TestOperation", "Failed test operation", failureErr, failureData)

	events := emitter.GetEvents()
	assert.Equal(t, 2, len(events))
	event := events[1]
	assert.Equal(t, query, event.Object)
	assert.Equal(t, "TestOperationError", event.Reason)
	assert.Contains(t, event.Message, "Failed test operation")

	assert.NotNil(t, event.Data)
	data, ok := (*event.Data).(map[string]string)
	assert.True(t, ok)
	assert.Equal(t, "test-component", data["component"])
	assert.Equal(t, "test error", data["error"])
	assert.Contains(t, data, "durationMs")
	assert.Contains(t, data, "timestamp")
}

func TestOperationTracker_Fail_NoQueryContext(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	ot.Fail(context.Background(), "TestOperation", "Failed test operation", errors.New("test error"), nil)

	assert.Equal(t, 0, emitter.EventCount())
}

func TestOperationTracker_Fail_NilData(t *testing.T) {
	emitter := mock.NewMockEventEmitter()
	ot := NewOperationTracker(emitter)

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "test-ns",
			UID:       types.UID("test-uid"),
		},
		Spec: arkv1alpha1.QuerySpec{
			SessionId: "session-123",
		},
	}

	ctx := ot.InitializeQueryContext(context.Background(), query)

	ot.Fail(ctx, "TestOperation", "Failed test operation", errors.New("test error"), nil)

	events := emitter.GetEvents()
	assert.Equal(t, 1, len(events))
	event := events[0]
	assert.NotNil(t, event.Data)
	data, ok := (*event.Data).(map[string]string)
	assert.True(t, ok)
	assert.Equal(t, "test error", data["error"])
}
