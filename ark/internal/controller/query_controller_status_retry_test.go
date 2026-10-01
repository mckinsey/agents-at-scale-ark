/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newRetryTestQuery() *arkv1alpha1.Query {
	return &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "retry-q", Namespace: "default"},
		Status: arkv1alpha1.QueryStatus{
			Phase: statusRunning,
			Conditions: []metav1.Condition{{
				Type:               string(arkv1alpha1.QueryCompleted),
				Status:             metav1.ConditionFalse,
				Reason:             "QueryRunning",
				LastTransitionTime: metav1.Now(),
			}},
		},
	}
}

func TestUpdateStatusWithDurationRetriesTransientError(t *testing.T) {
	q := newRetryTestQuery()

	var attempts int
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(ctx context.Context, cl client.Client, _ string, obj client.Object, opts ...client.SubResourceUpdateOption) error {
				attempts++
				if attempts <= 2 {
					return apierrors.NewTooManyRequests("api priority & fairness throttling", 1)
				}
				return cl.Status().Update(ctx, obj, opts...)
			},
		}).Build()

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

	err := r.updateStatus(context.Background(), q, statusDone)

	require.NoError(t, err, "a transient throttling error must be retried, not surfaced as a failure")
	assert.Equal(t, 3, attempts, "should retry twice then succeed on the third attempt")

	var got arkv1alpha1.Query
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: "retry-q", Namespace: "default"}, &got))
	assert.Equal(t, statusDone, got.Status.Phase, "the terminal phase must be persisted despite the earlier transient failures")
}

func TestUpdateStatusPreservesErrorContentWhenCacheStripped(t *testing.T) {
	// The cache transform strips status.response.content from the cached copy.
	// The backing store below returns a stripped Query on Get, mirroring that.
	// updateStatusWithDuration must still produce the QueryErrored condition from
	// the in-memory Response the reconcile holds, not from the stripped refetch.
	stored := newRetryTestQuery()
	stored.Status.Response = &arkv1alpha1.Response{Phase: statusError, Content: ""}

	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(stored).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		Build()

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

	inMemory := newRetryTestQuery()
	inMemory.Status.Response = &arkv1alpha1.Response{Phase: statusError, Content: "boom: model timed out"}

	require.NoError(t, r.updateStatus(context.Background(), inMemory, statusError))

	var got arkv1alpha1.Query
	require.NoError(t, c.Get(context.Background(), types.NamespacedName{Name: "retry-q", Namespace: "default"}, &got))

	cond := meta.FindStatusCondition(got.Status.Conditions, string(arkv1alpha1.QueryCompleted))
	require.NotNil(t, cond)
	assert.Equal(t, "QueryErrored", cond.Reason)
	assert.Equal(t, "boom: model timed out", cond.Message, "error message must come from the in-memory Response, not the cache-stripped refetch")

	require.NotNil(t, got.Status.Response)
	assert.Equal(t, "boom: model timed out", got.Status.Response.Content,
		"persisted response content must come from the in-memory Response, not the cache-stripped refetch")
}

func TestUpdateStatusWithDurationDoesNotRetryPermanentError(t *testing.T) {
	q := newRetryTestQuery()

	var attempts int
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(q).
		WithStatusSubresource(&arkv1alpha1.Query{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				attempts++
				return apierrors.NewBadRequest("permanent: invalid status")
			},
		}).Build()

	r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

	err := r.updateStatus(context.Background(), q, statusDone)

	require.Error(t, err, "a non-retriable error must be surfaced, not swallowed")
	assert.Equal(t, 1, attempts, "a permanent error must not be retried")
}
