/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newQueuedForgetReconciler(t *testing.T, objs ...client.Object) (*QueryReconciler, types.NamespacedName) {
	t.Helper()
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(objs...).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		Build()
	r := &QueryReconciler{
		Client:               c,
		Scheme:               c.Scheme(),
		MaxConcurrentQueries: 1,
		sched:                newFairScheduler(1, queryFairnessQueuedKeyExpiry),
	}
	key := types.NamespacedName{Namespace: "default", Name: "queued-query"}
	require.True(t, r.sched.tryAcquire(types.NamespacedName{Namespace: "busy-ns", Name: "busy-query"}))
	require.False(t, r.sched.tryAcquire(key))
	require.Contains(t, r.sched.queued, "default", "pre-condition: the query's namespace is waiting")
	return r, key
}

func newQueuedForgetQuery(phase string) *arkv1alpha1.Query {
	q := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:       "queued-query",
			Namespace:  "default",
			Finalizers: []string{finalizer},
		},
		Spec: arkv1alpha1.QuerySpec{
			Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
			TTL:    &metav1.Duration{Duration: time.Hour},
		},
	}
	q.Status.Phase = phase
	q.Status.Conditions = []metav1.Condition{{
		Type:               "Completed",
		Status:             metav1.ConditionFalse,
		Reason:             "QueryNotStarted",
		LastTransitionTime: metav1.Now(),
	}}
	return q
}

func reconcileQuery(t *testing.T, r *QueryReconciler, key types.NamespacedName) ctrl.Result {
	t.Helper()
	result, err := r.Reconcile(context.Background(), ctrl.Request{NamespacedName: key})
	require.NoError(t, err)
	return result
}

func TestQueuedQueryForgotten_WhenDeleted(t *testing.T) {
	r, key := newQueuedForgetReconciler(t)

	reconcileQuery(t, r, key)

	assert.NotContains(t, r.sched.queued, "default")
}

func TestQueuedQueryForgotten_WhenBeingDeleted(t *testing.T) {
	q := newQueuedForgetQuery(statusQueued)
	now := metav1.Now()
	q.DeletionTimestamp = &now
	r, key := newQueuedForgetReconciler(t, q)

	reconcileQuery(t, r, key)

	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenCanceled(t *testing.T) {
	q := newQueuedForgetQuery(statusQueued)
	q.Spec.Cancel = true
	r, key := newQueuedForgetReconciler(t, q)

	result := reconcileQuery(t, r, key)
	require.True(t, result.Requeue, "cancel requeues so the terminal phase is reconciled")
	reconcileQuery(t, r, key)

	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenTimedOutInQueue(t *testing.T) {
	q := newQueuedForgetQuery(statusQueued)
	q.Spec.Timeout = &metav1.Duration{Duration: time.Millisecond}
	q.CreationTimestamp = metav1.NewTime(time.Now().Add(-time.Minute))
	r, key := newQueuedForgetReconciler(t, q)

	result := reconcileQuery(t, r, key)
	require.True(t, result.Requeue, "a pre-execution timeout requeues so the terminal phase is reconciled")
	reconcileQuery(t, r, key)

	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenTerminal(t *testing.T) {
	r, key := newQueuedForgetReconciler(t, newQueuedForgetQuery(statusDone))

	reconcileQuery(t, r, key)

	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenInAnyPhasePastPreExecution(t *testing.T) {
	r, key := newQueuedForgetReconciler(t, newQueuedForgetQuery(statusInputRequired))

	reconcileQuery(t, r, key)

	assert.NotContains(t, r.sched.queued, key.Namespace, "a phase with no explicit removal path still drops the key")
}

func TestQueuedQueryKept_WhileWaitingForCapacity(t *testing.T) {
	for _, phase := range []string{"", statusPending, statusQueued} {
		t.Run("phase="+phase, func(t *testing.T) {
			r, key := newQueuedForgetReconciler(t, newQueuedForgetQuery(phase))

			reconcileQuery(t, r, key)

			assert.Contains(t, r.sched.queued, key.Namespace, "a query still waiting for a slot stays queued")
		})
	}
}
