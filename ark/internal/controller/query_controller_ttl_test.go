/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
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
)

func TestReconcileTTLGuardErrorPaths(t *testing.T) {
	key := types.NamespacedName{Name: "q", Namespace: "default"}
	req := ctrl.Request{NamespacedName: key}

	buildQuery := func(withFinalizer bool) *arkv1alpha1.Query {
		q := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      key.Name,
				Namespace: key.Namespace,
			},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "a"},
				TTL:    &metav1.Duration{Duration: time.Nanosecond},
			},
			Status: arkv1alpha1.QueryStatus{
				Phase: statusDone,
				Conditions: []metav1.Condition{{
					Type:               string(arkv1alpha1.QueryCompleted),
					Status:             metav1.ConditionTrue,
					Reason:             "QuerySucceeded",
					LastTransitionTime: metav1.NewTime(time.Now().Add(-time.Hour)),
				}},
			},
		}
		if withFinalizer {
			q.Finalizers = []string{finalizer}
		}
		return q
	}

	t.Run("returns error when Delete fails", func(t *testing.T) {
		deleteErr := errors.New("boom-delete")
		c := fake.NewClientBuilder().WithScheme(newTestScheme()).
			WithObjects(buildQuery(true)).
			WithInterceptorFuncs(interceptor.Funcs{
				Delete: func(_ context.Context, _ client.WithWatch, _ client.Object, _ ...client.DeleteOption) error {
					return deleteErr
				},
			}).Build()
		r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

		_, err := r.Reconcile(context.Background(), req)

		require.Error(t, err)
		assert.ErrorIs(t, err, deleteErr)
	})

	t.Run("returns error when refetch after Delete fails", func(t *testing.T) {
		getErr := errors.New("boom-refetch")
		var gets int
		c := fake.NewClientBuilder().WithScheme(newTestScheme()).
			WithObjects(buildQuery(true)).
			WithInterceptorFuncs(interceptor.Funcs{
				Get: func(ctx context.Context, cl client.WithWatch, k client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
					gets++
					if gets >= 2 {
						return getErr
					}
					return cl.Get(ctx, k, obj, opts...)
				},
			}).Build()
		r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

		_, err := r.Reconcile(context.Background(), req)

		require.Error(t, err)
		assert.ErrorIs(t, err, getErr)
	})

	t.Run("swallows NotFound on refetch after Delete reaps object", func(t *testing.T) {
		c := fake.NewClientBuilder().WithScheme(newTestScheme()).
			WithObjects(buildQuery(false)).
			Build()
		r := &QueryReconciler{Client: c, Scheme: c.Scheme()}

		_, err := r.Reconcile(context.Background(), req)

		require.NoError(t, err)
		var got arkv1alpha1.Query
		err = c.Get(context.Background(), key, &got)
		assert.True(t, apierrors.IsNotFound(err), "object should be gone after guard")
	})
}
