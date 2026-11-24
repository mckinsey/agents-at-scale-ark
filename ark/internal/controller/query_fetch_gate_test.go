/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResourceVersionAtLeast(t *testing.T) {
	cases := []struct {
		name   string
		actual string
		min    string
		want   bool
	}{
		{"newer numeric RV is at least the older one", "20", "10", true},
		{"older numeric RV is not at least the newer one", "10", "20", false},
		{"equal numeric RVs are at least each other", "15", "15", true},
		{"non-numeric RVs fall back to string equality when equal", "abc", "abc", true},
		{"non-numeric RVs fall back to string equality when different", "abc", "def", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, resourceVersionAtLeast(tc.actual, tc.min))
		})
	}
}

func TestFetchQuery_SkipsAPIReaderWhenCacheAlreadyFresh(t *testing.T) {
	nn := types.NamespacedName{Namespace: "default", Name: "q1"}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: nn.Name, Namespace: nn.Namespace, ResourceVersion: "20"},
	}
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(query).Build()

	apiReaderCalled := false
	apiReader := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
				apiReaderCalled = true
				return c.Get(ctx, key, obj, opts...)
			},
		}).WithObjects(query).Build()

	r := &QueryReconciler{Client: c, APIReader: apiReader}
	r.pendingFreshReads.Store(nn, "10")

	_, err := r.fetchQuery(context.Background(), nn)
	require.NoError(t, err)
	require.False(t, apiReaderCalled, "cached RV already satisfies the pending marker, APIReader must not be consulted")

	_, stillPending := r.pendingFreshReads.Load(nn)
	require.False(t, stillPending, "a consumed marker must be removed")
}

func TestFetchQuery_FallsBackToAPIReaderWhenCacheIsStale(t *testing.T) {
	nn := types.NamespacedName{Namespace: "default", Name: "q1"}
	staleQuery := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: nn.Name, Namespace: nn.Namespace, ResourceVersion: "10"},
	}
	freshQuery := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: nn.Name, Namespace: nn.Namespace, ResourceVersion: "20"},
	}
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(staleQuery).Build()
	apiReader := fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(freshQuery).Build()

	r := &QueryReconciler{Client: c, APIReader: apiReader}
	r.pendingFreshReads.Store(nn, "20")

	got, err := r.fetchQuery(context.Background(), nn)
	require.NoError(t, err)
	require.Equal(t, "20", got.ResourceVersion, "stale cache must fall back to the APIReader")
}

func TestFetchQuery_ClearsPendingMarkerOnGetError(t *testing.T) {
	nn := types.NamespacedName{Namespace: "default", Name: "gone"}
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(_ context.Context, _ client.WithWatch, _ client.ObjectKey, _ client.Object, _ ...client.GetOption) error {
				return errors.New("boom-get")
			},
		}).Build()

	r := &QueryReconciler{Client: c}
	r.pendingFreshReads.Store(nn, "10")

	_, err := r.fetchQuery(context.Background(), nn)
	require.Error(t, err)

	_, stillPending := r.pendingFreshReads.Load(nn)
	require.False(t, stillPending, "a Get error must not strand the marker for a deleted object")
}
