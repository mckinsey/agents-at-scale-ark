/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/semaphore"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
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
		sem:                  semaphore.NewWeighted(1),
	}
	require.True(t, r.sem.TryAcquire(1), "pre-condition: saturate the semaphore so handleRunningPhase hits the queued-write branch")

	req := ctrl.Request{NamespacedName: types.NamespacedName{Name: q.Name, Namespace: q.Namespace}}
	_, err := r.handleRunningPhase(context.Background(), req, *q)

	require.Error(t, err, "handleRunningPhase must surface a queued-write failure so the reconciler retries")
	assert.False(t, r.sem.TryAcquire(1), "sem-full branch must not attempt a new acquisition; the pre-acquired slot is still held")
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
		sem:                  semaphore.NewWeighted(1),
	}

	req := ctrl.Request{NamespacedName: types.NamespacedName{Name: q.Name, Namespace: q.Namespace}}
	_, err := r.handleRunningPhase(context.Background(), req, *q)

	require.Error(t, err, "handleRunningPhase must surface a running-write failure so the reconciler retries")
	assert.True(t, r.sem.TryAcquire(1), "semaphore slot must be released on running-write error to prevent a permanent leak")
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

// remainingBudget is the load-bearing helper every timeout branch depends on
// (pre-flight check, sem-full clamp, executor context, executor-error
// discrimination). Direct table-driven coverage so a subtle sign flip or
// default-fallback regression can't slip through the higher-level Ginkgo
// suites — the nil-Timeout fallback in particular is the common case for
// clients that omit the field.
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
					roundAnchorAnnotation: time.Now().Add(-*tc.anchorAgo).UTC().Format(time.RFC3339Nano),
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
