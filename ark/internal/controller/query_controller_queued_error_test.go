/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

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
