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
		ObjectMeta: metav1.ObjectMeta{Name: "queued-query", Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
			TTL:    &metav1.Duration{Duration: time.Hour},
		},
	}
	q.Status.Phase = phase
	return q
}

func TestQueuedQueryForgotten_WhenDeleted(t *testing.T) {
	r, key := newQueuedForgetReconciler(t)

	_, err := r.Reconcile(context.Background(), ctrl.Request{NamespacedName: key})

	require.NoError(t, err)
	assert.NotContains(t, r.sched.queued, "default")
}

func TestQueuedQueryForgotten_WhenBeingDeleted(t *testing.T) {
	r, key := newQueuedForgetReconciler(t)
	q := newQueuedForgetQuery(statusQueued)
	now := metav1.Now()
	q.DeletionTimestamp = &now

	result, err := r.handleFinalizer(context.Background(), q)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenCanceled(t *testing.T) {
	q := newQueuedForgetQuery(statusQueued)
	q.Spec.Cancel = true
	r, key := newQueuedForgetReconciler(t, q)

	_, err := r.handleQueryExecution(context.Background(), ctrl.Request{NamespacedName: key}, *q)

	require.NoError(t, err)
	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenTimedOutInQueue(t *testing.T) {
	q := newQueuedForgetQuery(statusQueued)
	q.Spec.Timeout = &metav1.Duration{Duration: time.Millisecond}
	q.CreationTimestamp = metav1.NewTime(time.Now().Add(-time.Minute))
	r, key := newQueuedForgetReconciler(t, q)

	_, err := r.handleQueryExecution(context.Background(), ctrl.Request{NamespacedName: key}, *q)

	require.NoError(t, err)
	assert.NotContains(t, r.sched.queued, key.Namespace)
}

func TestQueuedQueryForgotten_WhenTerminal(t *testing.T) {
	q := newQueuedForgetQuery(statusDone)
	r, key := newQueuedForgetReconciler(t, q)

	_, err := r.handleQueryExecution(context.Background(), ctrl.Request{NamespacedName: key}, *q)

	require.NoError(t, err)
	assert.NotContains(t, r.sched.queued, key.Namespace)
}
