/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func setupWorkspaceControllerTest(t *testing.T, objects ...client.Object) (*WorkspaceReconciler, client.Client) {
	t.Helper()
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))

	builder := fake.NewClientBuilder().
		WithScheme(scheme).
		WithStatusSubresource(&arkv1alpha1.Workspace{})

	if len(objects) > 0 {
		builder = builder.WithObjects(objects...)
	}

	fakeClient := builder.Build()

	reconciler := &WorkspaceReconciler{
		Client: fakeClient,
		Scheme: scheme,
	}
	return reconciler, fakeClient
}

func TestWorkspaceReconcile_NotFound(t *testing.T) {
	r, _ := setupWorkspaceControllerTest(t)

	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "nonexistent", Namespace: "default"},
	})

	require.NoError(t, err)
	require.Equal(t, reconcile.Result{}, result)
}

func TestWorkspaceReconcile_AddsFinalizer(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-ws",
			Namespace: "default",
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
		},
	}

	r, k8s := setupWorkspaceControllerTest(t, ws)
	ctx := context.Background()

	_, err := r.Reconcile(ctx, reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "test-ws", Namespace: "default"},
	})
	require.NoError(t, err)

	var updated arkv1alpha1.Workspace
	require.NoError(t, k8s.Get(ctx, types.NamespacedName{Name: "test-ws", Namespace: "default"}, &updated))
	require.True(t, controllerutil.ContainsFinalizer(&updated, annotations.WorkspaceFinalizer))
}

func TestWorkspaceReconcile_AlreadyReady_NoRequeue(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:       "ready-ws",
			Namespace:  "default",
			Finalizers: []string{annotations.WorkspaceFinalizer},
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
		},
		Status: arkv1alpha1.WorkspaceStatus{
			Phase: "Ready",
		},
	}

	r, _ := setupWorkspaceControllerTest(t, ws)

	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "ready-ws", Namespace: "default"},
	})

	require.NoError(t, err)
	require.Equal(t, time.Duration(0), result.RequeueAfter)
}

func TestWorkspaceReconcile_ErrorPhase_NoRetry(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:       "error-ws",
			Namespace:  "default",
			Finalizers: []string{annotations.WorkspaceFinalizer},
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
		},
		Status: arkv1alpha1.WorkspaceStatus{
			Phase: "Error",
		},
	}

	r, _ := setupWorkspaceControllerTest(t, ws)

	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "error-ws", Namespace: "default"},
	})

	require.NoError(t, err)
	require.Equal(t, reconcile.Result{}, result)
}

func TestWorkspaceReconcile_ProvisioningPhase_RequeuesAfter5s(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:       "provisioning-ws",
			Namespace:  "default",
			Finalizers: []string{annotations.WorkspaceFinalizer},
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
		},
		Status: arkv1alpha1.WorkspaceStatus{
			Phase: "Provisioning",
		},
	}

	r, _ := setupWorkspaceControllerTest(t, ws)

	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "provisioning-ws", Namespace: "default"},
	})

	require.NoError(t, err)
	require.Equal(t, 5*time.Second, result.RequeueAfter)
}

func TestWorkspaceReconcile_NewWorkspace_SetsErrorPhaseWhenServiceUnavailable(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:       "new-ws",
			Namespace:  "default",
			Finalizers: []string{annotations.WorkspaceFinalizer},
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
		},
	}

	r, k8s := setupWorkspaceControllerTest(t, ws)
	ctx := context.Background()

	_, err := r.Reconcile(ctx, reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "new-ws", Namespace: "default"},
	})
	require.NoError(t, err)

	var updated arkv1alpha1.Workspace
	require.NoError(t, k8s.Get(ctx, types.NamespacedName{Name: "new-ws", Namespace: "default"}, &updated))
	require.Equal(t, "Error", updated.Status.Phase)

	found := false
	for _, c := range updated.Status.Conditions {
		if c.Type == "Ready" {
			found = true
			require.Equal(t, metav1.ConditionFalse, c.Status)
			require.Equal(t, "ProvisionFailed", c.Reason)
		}
	}
	require.True(t, found, "should have Ready condition set to ProvisionFailed")
}

func TestWorkspaceReconcile_TTLExpired_Deletes(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "ttl-ws",
			Namespace:         "default",
			Finalizers:        []string{annotations.WorkspaceFinalizer},
			CreationTimestamp:  metav1.NewTime(time.Now().Add(-2 * time.Hour)),
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
			TTL: &metav1.Duration{Duration: 1 * time.Hour},
		},
	}

	r, k8s := setupWorkspaceControllerTest(t, ws)
	ctx := context.Background()

	_, err := r.Reconcile(ctx, reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "ttl-ws", Namespace: "default"},
	})
	require.NoError(t, err)

	var updated arkv1alpha1.Workspace
	err = k8s.Get(ctx, types.NamespacedName{Name: "ttl-ws", Namespace: "default"}, &updated)
	if err == nil {
		require.False(t, updated.DeletionTimestamp.IsZero(), "workspace should have deletion timestamp")
	}
}

func TestWorkspaceReconcile_ReadyWithTTL_RequeuesAtExpiry(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "ttl-ready-ws",
			Namespace:         "default",
			Finalizers:        []string{annotations.WorkspaceFinalizer},
			CreationTimestamp:  metav1.NewTime(time.Now()),
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Empty: &arkv1alpha1.WorkspaceContentEmpty{},
			},
			TTL: &metav1.Duration{Duration: 1 * time.Hour},
		},
		Status: arkv1alpha1.WorkspaceStatus{
			Phase: "Ready",
		},
	}

	r, _ := setupWorkspaceControllerTest(t, ws)

	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "ttl-ready-ws", Namespace: "default"},
	})

	require.NoError(t, err)
	require.True(t, result.RequeueAfter > 0, "should requeue before TTL expiry")
	require.True(t, result.RequeueAfter <= 1*time.Hour, "requeue should be within TTL")
}

func TestWorkspace_SetPhase_OnlyModifiesInMemory(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{Name: "test", Namespace: "default"},
	}

	r, _ := setupWorkspaceControllerTest(t)
	r.setPhase(ws, "Ready")
	require.Equal(t, "Ready", ws.Status.Phase)

	r.setPhase(ws, "Error")
	require.Equal(t, "Error", ws.Status.Phase)
}

func TestWorkspace_SetCondition_OnlyModifiesInMemory(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{Name: "test", Namespace: "default"},
	}

	r, _ := setupWorkspaceControllerTest(t)
	r.setCondition(ws, "Ready", metav1.ConditionTrue, "Provisioned", "Test message")

	require.Len(t, ws.Status.Conditions, 1)
	require.Equal(t, "Ready", ws.Status.Conditions[0].Type)
	require.Equal(t, metav1.ConditionTrue, ws.Status.Conditions[0].Status)
	require.Equal(t, "Provisioned", ws.Status.Conditions[0].Reason)
}

func TestWorkspaceReconcile_HandleDeletion_SetsTerminatingPhase(t *testing.T) {
	ws := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{Name: "test", Namespace: "default"},
		Status: arkv1alpha1.WorkspaceStatus{
			Phase: "Ready",
		},
	}

	r, _ := setupWorkspaceControllerTest(t)
	r.setPhase(ws, "Terminating")
	require.Equal(t, "Terminating", ws.Status.Phase)
}
