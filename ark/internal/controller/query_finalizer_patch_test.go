/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// A terminal Query whose status was stripped from the cache must not have that
// empty status written back when the finalizer is added. handleFinalizer must
// patch only metadata.finalizers, never a plain Update of the whole object
// (which would carry the stripped status to backends without a status
// subresource). Regression guard for #3518 review feedback.
func TestHandleFinalizer_AddsFinalizerViaFinalizersOnlyPatch(t *testing.T) {
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
		Status: arkv1alpha1.QueryStatus{
			Phase: statusError,
		},
	}

	var patchBody []byte
	fc := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(query).
		WithInterceptorFuncs(interceptor.Funcs{
			Update: func(context.Context, client.WithWatch, client.Object, ...client.UpdateOption) error {
				t.Fatal("handleFinalizer must not Update the whole object; it would carry the stripped status")
				return nil
			},
			Patch: func(ctx context.Context, c client.WithWatch, obj client.Object, patch client.Patch, opts ...client.PatchOption) error {
				data, err := patch.Data(obj)
				if err != nil {
					return err
				}
				patchBody = data
				return c.Patch(ctx, obj, patch, opts...)
			},
		}).
		Build()

	r := &QueryReconciler{Client: fc}

	// obj comes from the cache with content stripped.
	cached := query.DeepCopy()
	result, err := r.handleFinalizer(context.Background(), cached)
	require.NoError(t, err)
	require.NotNil(t, result)

	// The patch touches only metadata.finalizers, never status.
	var decoded map[string]any
	require.NoError(t, json.Unmarshal(patchBody, &decoded))
	assert.NotContains(t, decoded, "status", "finalizer patch must not carry status")
	meta, ok := decoded["metadata"].(map[string]any)
	require.True(t, ok, "patch must set metadata")
	assert.Contains(t, meta, "finalizers")

	// The finalizer is persisted.
	var stored arkv1alpha1.Query
	require.NoError(t, fc.Get(context.Background(), types.NamespacedName{Name: "my-query", Namespace: "default"}, &stored))
	assert.Contains(t, stored.Finalizers, finalizer)
}
