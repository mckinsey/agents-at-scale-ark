/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newStatusTestAgent() *arkv1alpha1.Agent {
	return &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "status-agent", Namespace: "default"},
	}
}

func TestUpdateStatusIgnoringDeletedSuccess(t *testing.T) {
	agent := newStatusTestAgent()
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(agent).
		WithStatusSubresource(&arkv1alpha1.Agent{}).
		Build()

	err := updateStatusIgnoringDeleted(context.Background(), c, agent, "agent")
	require.NoError(t, err)
}

func TestUpdateStatusIgnoringDeletedCancelledContext(t *testing.T) {
	agent := newStatusTestAgent()
	var attempts int
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(agent).
		WithStatusSubresource(&arkv1alpha1.Agent{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(ctx context.Context, cl client.Client, _ string, obj client.Object, opts ...client.SubResourceUpdateOption) error {
				attempts++
				return cl.Status().Update(ctx, obj, opts...)
			},
		}).Build()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := updateStatusIgnoringDeleted(ctx, c, agent, "agent")
	require.NoError(t, err, "a cancelled context must be a no-op")
	assert.Equal(t, 0, attempts, "no update should be attempted once the context is cancelled")
}

func TestUpdateStatusIgnoringDeletedNotFound(t *testing.T) {
	agent := newStatusTestAgent()
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(agent).
		WithStatusSubresource(&arkv1alpha1.Agent{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return apierrors.NewNotFound(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: "agents"}, agent.Name)
			},
		}).Build()

	err := updateStatusIgnoringDeleted(context.Background(), c, agent, "agent")
	require.NoError(t, err, "a NotFound on update means the object was deleted mid-reconcile; treat as success")
}

func TestUpdateStatusIgnoringDeletedConflictThenGone(t *testing.T) {
	agent := newStatusTestAgent()
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(agent).
		WithStatusSubresource(&arkv1alpha1.Agent{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return apierrors.NewConflict(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: "agents"}, agent.Name, errors.New("stale UID precondition"))
			},
			Get: func(_ context.Context, _ client.WithWatch, key client.ObjectKey, _ client.Object, _ ...client.GetOption) error {
				return apierrors.NewNotFound(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: "agents"}, key.Name)
			},
		}).Build()

	err := updateStatusIgnoringDeleted(context.Background(), c, agent, "agent")
	require.NoError(t, err, "a Conflict resolved by a NotFound Get means the object is genuinely gone; treat as success")
}

func TestUpdateStatusIgnoringDeletedConflictStillExists(t *testing.T) {
	agent := newStatusTestAgent()
	conflictErr := apierrors.NewConflict(schema.GroupResource{Group: arkv1alpha1.GroupVersion.Group, Resource: "agents"}, agent.Name, errors.New("optimistic concurrency clash"))
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(agent).
		WithStatusSubresource(&arkv1alpha1.Agent{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return conflictErr
			},
		}).Build()

	err := updateStatusIgnoringDeleted(context.Background(), c, agent, "agent")
	require.Error(t, err, "a Conflict where the object still exists is an optimistic-concurrency clash; surface it so the caller requeues")
	assert.True(t, apierrors.IsConflict(err))
}

func TestUpdateStatusIgnoringDeletedOtherError(t *testing.T) {
	agent := newStatusTestAgent()
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithObjects(agent).
		WithStatusSubresource(&arkv1alpha1.Agent{}).
		WithInterceptorFuncs(interceptor.Funcs{
			SubResourceUpdate: func(_ context.Context, _ client.Client, _ string, _ client.Object, _ ...client.SubResourceUpdateOption) error {
				return apierrors.NewInternalError(errors.New("boom"))
			},
		}).Build()

	err := updateStatusIgnoringDeleted(context.Background(), c, agent, "agent")
	require.Error(t, err, "a non-deletion error must be surfaced so the caller requeues")
	assert.False(t, apierrors.IsNotFound(err))
}
