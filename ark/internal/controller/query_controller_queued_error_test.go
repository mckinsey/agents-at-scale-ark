/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

// The two error paths added by the queued-phase change (queued-write fail,
// running-write fail) are unreachable with the real envtest apiserver.
// A fake client with an interceptor is the only way to observe them.

func newTestQueryForHandleRunningPhaseError(name string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
		},
	}
}

func TestHandleRunningPhase_QueuedUpdateError_ReturnsError(t *testing.T) {
	q := newTestQueryForHandleRunningPhaseError("queued-err")

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return apierrors.NewBadRequest("simulated permanent status update error")
			},
		}).Build()

	r := &QueryReconciler{
		Client:               c,
		Scheme:               c.Scheme(),
		MaxConcurrentQueries: 1,
		sched:                newFairScheduler(1, queryFairnessWaitWindow),
	}
	require.True(t, r.sched.tryAcquire(q.Namespace), "pre-condition: saturate the pool so handleRunningPhase hits the queued-write branch")

	req := ctrl.Request{NamespacedName: types.NamespacedName{Name: q.Name, Namespace: q.Namespace}}
	_, err := r.handleRunningPhase(context.Background(), req, *q)

	require.Error(t, err, "handleRunningPhase must surface a queued-write failure so the reconciler retries")
	assert.False(t, r.sched.tryAcquire(q.Namespace), "capacity-full branch must not acquire a new slot; the pre-acquired slot is still held")
}

func TestHandleRunningPhase_RunningUpdateError_ReleasesSemaphore(t *testing.T) {
	q := newTestQueryForHandleRunningPhaseError("running-err")

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return apierrors.NewBadRequest("simulated permanent status update error")
			},
		}).Build()

	r := &QueryReconciler{
		Client:               c,
		Scheme:               c.Scheme(),
		MaxConcurrentQueries: 1,
		sched:                newFairScheduler(1, queryFairnessWaitWindow),
	}

	req := ctrl.Request{NamespacedName: types.NamespacedName{Name: q.Name, Namespace: q.Namespace}}
	_, err := r.handleRunningPhase(context.Background(), req, *q)

	require.Error(t, err, "handleRunningPhase must surface a running-write failure so the reconciler retries")
	assert.True(t, r.sched.tryAcquire(q.Namespace), "slot must be released on running-write error to prevent a permanent leak")
}

func TestFailQueryOnTimeout_StatusUpdateError_Propagates(t *testing.T) {
	q := newTestQueryForHandleRunningPhaseError("timeout-write-err")

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return apierrors.NewBadRequest("simulated permanent status update error")
			},
		}).Build()

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

	err := r.failQueryOnTimeout(context.Background(), q, reasonTimedOutInQueue, "test message")

	require.Error(t, err, "failQueryOnTimeout must surface the update failure so the reconciler retries and doesn't silently swallow a lost terminal write")
}

// A HITL-resumed query that hits TimedOutInExecution must retain its A2A
// correlation and raw payload — only Content/Phase get overwritten with
// the timeout signal.
func TestFailQueryOnTimeout_PreservesA2AAndRaw(t *testing.T) {
	q := newTestQueryForHandleRunningPhaseError("timeout-preserve-a2a")
	q.Status.Response = &arkv1alpha1.Response{
		Target:  arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
		Content: "partial output before timeout",
		Raw:     `{"partial":"payload"}`,
		Phase:   statusRunning,
		A2A:     &arkv1alpha1.A2AMetadata{ContextID: "ctx-preserve", TaskID: "task-preserve"},
	}

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		Build()
	require.NoError(t, c.Status().Update(context.Background(), q))

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}
	require.NoError(t, r.failQueryOnTimeout(context.Background(), q, reasonTimedOutInExecution, "Query timed out during execution"))

	after := &arkv1alpha1.Query{}
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: q.Name, Namespace: q.Namespace}, after))
	require.NotNil(t, after.Status.Response)
	assert.Equal(t, statusError, after.Status.Phase)
	assert.Equal(t, "Query timed out during execution", after.Status.Response.Content, "Content must be replaced with the timeout signal")
	assert.Equal(t, statusError, after.Status.Response.Phase, "Response.Phase must mirror the terminal state")
	assert.Equal(t, `{"partial":"payload"}`, after.Status.Response.Raw, "Raw payload must survive so downstream observers can debug the timed-out call")
	require.NotNil(t, after.Status.Response.A2A, "A2A metadata must survive so the associated A2ATask can still be correlated")
	assert.Equal(t, "task-preserve", after.Status.Response.A2A.TaskID)
	assert.Equal(t, "ctx-preserve", after.Status.Response.A2A.ContextID)
}

func TestRemainingBudget(t *testing.T) {
	tests := []struct {
		name          string
		creationAgo   time.Duration
		anchorAgo     *time.Duration // nil => no annotation set
		timeout       *metav1.Duration
		wantPositive  bool
		approxSeconds float64
	}{
		{
			name:          "nil spec.Timeout falls back to defaultQueryTimeout",
			creationAgo:   0,
			timeout:       nil,
			wantPositive:  true,
			approxSeconds: defaultQueryTimeout.Seconds(),
		},
		{
			name:          "explicit spec.Timeout is honored",
			creationAgo:   0,
			timeout:       &metav1.Duration{Duration: 30 * time.Second},
			wantPositive:  true,
			approxSeconds: 30,
		},
		{
			// The negative-sign convention every enforcement branch depends
			// on: `remainingBudget <= 0` is the timeout trigger.
			name:          "elapsed budget returns negative",
			creationAgo:   10 * time.Minute,
			timeout:       nil, // default 5m — 10m ago → -5m
			wantPositive:  false,
			approxSeconds: -(5 * time.Minute).Seconds(),
		},
		{
			// Per-round semantics: an old creationTimestamp is overridden by
			// a fresh round-anchor annotation, giving the resumed round a
			// full spec.timeout budget.
			name:          "fresh anchor annotation overrides old creationTimestamp",
			creationAgo:   10 * time.Minute,
			anchorAgo:     durPtr(0),
			timeout:       &metav1.Duration{Duration: 30 * time.Second},
			wantPositive:  true,
			approxSeconds: 30,
		},
		{
			// Even an elapsed anchor is honored — this is the mechanism that
			// eventually surfaces a queue-timeout for a resumed round stuck
			// in a permanently saturated cluster.
			name:          "elapsed anchor annotation overrides recent creationTimestamp",
			creationAgo:   0,
			anchorAgo:     durPtr(2 * time.Minute),
			timeout:       &metav1.Duration{Duration: time.Minute},
			wantPositive:  false,
			approxSeconds: -time.Minute.Seconds(),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			meta := metav1.ObjectMeta{
				Name:              "budget-test",
				Namespace:         "default",
				CreationTimestamp: metav1.NewTime(time.Now().Add(-tc.creationAgo)),
			}
			if tc.anchorAgo != nil {
				meta.Annotations = map[string]string{
					annotations.RoundAnchor: time.Now().Add(-*tc.anchorAgo).UTC().Format(time.RFC3339Nano),
				}
			}
			q := &arkv1alpha1.Query{
				ObjectMeta: meta,
				Spec:       arkv1alpha1.QuerySpec{Timeout: tc.timeout},
			}

			got := remainingBudget(q)
			if tc.wantPositive {
				assert.Greater(t, got, time.Duration(0), "expected positive remaining budget")
			} else {
				assert.Less(t, got, time.Duration(0), "expected negative remaining budget (elapsed)")
			}
			assert.InDelta(t, tc.approxSeconds, got.Seconds(), 1.0,
				"remainingBudget should be within 1s of the expected value")
		})
	}
}

func durPtr(d time.Duration) *time.Duration { return &d }

// A TimedOutInExecution transition reached via the real dispatch error path
// must still retain the A2A correlation and raw payload. handleQueryDispatch
// replaces the in-memory Response with an unpersisted, A2A-less error response
// before returning; failQueryOnTimeout must derive Target/Raw/A2A from the
// last persisted status, not that scratch value.
func TestFailQueryOnTimeout_PreservesA2AThroughDispatchErrorPath(t *testing.T) {
	q := newTestQueryForHandleRunningPhaseError("timeout-dispatch-a2a")
	q.Status.Response = &arkv1alpha1.Response{
		Target:  arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
		Content: "awaiting approval",
		Raw:     `{"partial":"payload"}`,
		Phase:   statusInputRequired,
		A2A:     &arkv1alpha1.A2AMetadata{ContextID: "ctx-real", TaskID: "task-real"},
	}

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		Build()
	require.NoError(t, c.Status().Update(context.Background(), q))

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

	// Mimic the dispatch error branch: the local object's Response is replaced
	// with an A2A-less error response before failQueryOnTimeout runs.
	local := q.DeepCopy()
	local.Status.Response = createErrorResponse(*local.Spec.Target, context.DeadlineExceeded)
	require.NoError(t, r.failQueryOnTimeout(context.Background(), local,
		reasonTimedOutInExecution, "Query timed out during execution"))

	after := &arkv1alpha1.Query{}
	require.NoError(t, c.Get(context.Background(),
		types.NamespacedName{Name: q.Name, Namespace: q.Namespace}, after))
	require.NotNil(t, after.Status.Response)
	assert.Equal(t, statusError, after.Status.Phase)
	assert.Equal(t, "Query timed out during execution", after.Status.Response.Content)
	assert.Equal(t, `{"partial":"payload"}`, after.Status.Response.Raw,
		"raw payload from the last persisted round must survive")
	require.NotNil(t, after.Status.Response.A2A,
		"A2A correlation from the last persisted round must survive the dispatch error path")
	assert.Equal(t, "task-real", after.Status.Response.A2A.TaskID)
	assert.Equal(t, "ctx-real", after.Status.Response.A2A.ContextID)
}

// When a concurrent writer has already moved the query to a terminal phase,
// failQueryOnTimeout must decline the write entirely rather than persist a
// stale snapshot that regresses the completed query's TokenUsage/Response.
func TestFailQueryOnTimeout_DeclinesWriteWhenAlreadyTerminal(t *testing.T) {
	name := "timeout-terminal-race"
	cluster := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec:       arkv1alpha1.QuerySpec{Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"}},
		Status: arkv1alpha1.QueryStatus{
			Phase:      statusDone,
			TokenUsage: arkv1alpha1.TokenUsage{PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150},
			Response:   &arkv1alpha1.Response{Content: "final answer", Phase: statusDone},
		},
	}

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(cluster).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		Build()
	require.NoError(t, c.Status().Update(context.Background(), cluster))

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

	// Stale in-memory snapshot the timeout writer holds: still queued, no tokens.
	stale := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Status:     arkv1alpha1.QueryStatus{Phase: statusQueued},
	}
	require.NoError(t, r.failQueryOnTimeout(context.Background(), stale,
		reasonTimedOutInQueue, "timed out in queue"))

	after := &arkv1alpha1.Query{}
	require.NoError(t, c.Get(context.Background(),
		types.NamespacedName{Name: name, Namespace: "default"}, after))
	assert.Equal(t, statusDone, after.Status.Phase, "terminal phase must survive the losing write")
	assert.Equal(t, "final answer", after.Status.Response.Content)
	assert.Equal(t, int64(150), after.Status.TokenUsage.TotalTokens,
		"token usage of the completed query must not be regressed by the losing timeout write")
}
