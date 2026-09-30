/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/utils/ptr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
)

func TestInlineReconcileAddsTheFinalizer(t *testing.T) {
	tool := newInlineTool("finalized")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))

	_, updated := reconcileInlineTool(t, r, tool)

	assert.True(t, controllerutil.ContainsFinalizer(updated, InlineFinalizer))
}

func TestInlineDeletionRemovesEveryChild(t *testing.T) {
	tool := newInlineTool("deleted")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, stored := reconcileInlineTool(t, r, tool)

	require.NoError(t, r.Delete(context.Background(), stored))
	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
	require.NoError(t, err)

	// Children are deleted by the controller rather than left to
	// owner-reference garbage collection, so this holds on both backends.
	names := inlineChildNames(tool.Name)
	for _, child := range []struct {
		obj  client.Object
		name string
	}{
		{&appsv1.Deployment{}, names.Runner},
		{&corev1.Service{}, names.Runner},
		{&networkingv1.NetworkPolicy{}, names.Runner},
		{&corev1.ServiceAccount{}, names.Runner},
		{&corev1.ConfigMap{}, names.Source},
	} {
		err := r.Get(context.Background(), types.NamespacedName{Name: child.name, Namespace: tool.Namespace}, child.obj)
		assert.Truef(t, apierrors.IsNotFound(err), "%T %s should be gone, got %v", child.obj, child.name, err)
	}

	err = r.Get(context.Background(), types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace}, &arkv1alpha1.Tool{})
	assert.True(t, apierrors.IsNotFound(err), "the finalizer must be released")
}

func TestInlineDeletionLeavesForeignResourcesAlone(t *testing.T) {
	tool := newInlineTool("careful")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, stored := reconcileInlineTool(t, r, tool)

	// Something else takes over the ConfigMap name before the delete.
	configMap := &corev1.ConfigMap{}
	key := types.NamespacedName{Name: "careful-source", Namespace: inlineTestNamespace}
	require.NoError(t, r.Get(context.Background(), key, configMap))
	configMap.OwnerReferences = nil
	require.NoError(t, r.Update(context.Background(), configMap))

	require.NoError(t, r.Delete(context.Background(), stored))
	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
	require.NoError(t, err)

	assert.NoError(t, r.Get(context.Background(), key, configMap), "an unowned resource must survive")
}

func TestInlineDisableDrainsAndScalesDownTheRunner(t *testing.T) {
	tool := newInlineTool("draining")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, stored := reconcileInlineTool(t, r, tool)

	// The activator scaled this runner up for a call.
	deployment := inlineGetDeployment(t, r, "draining-runner")
	deployment.Spec.Replicas = ptr.To(int32(1))
	require.NoError(t, r.Update(context.Background(), deployment))

	t.Setenv(inlinetools.EnabledEnvVar, "false")

	// First disabled reconcile starts the drain and keeps the pod for now.
	result, updated := reconcileInlineTool(t, r, stored)
	assert.Equal(t, inlineDrainWindow, result.RequeueAfter)
	assert.Equal(t, int32(1), *inlineGetDeployment(t, r, "draining-runner").Spec.Replicas,
		"work already in flight gets the drain window")
	assert.Empty(t, updated.Status.ResolvedAddress, "the endpoint is withdrawn immediately")

	// Once the window has passed, the runner is scaled to zero: a disabled
	// feature must not leave pods running with nothing to scale them down.
	deployment = inlineGetDeployment(t, r, "draining-runner")
	deployment.Annotations[AnnotationInlineDrainStartedAt] = time.Now().UTC().Add(-2 * inlineDrainWindow).Format(time.RFC3339)
	require.NoError(t, r.Update(context.Background(), deployment))

	_, _ = reconcileInlineTool(t, r, stored)

	drained := inlineGetDeployment(t, r, "draining-runner")
	assert.Equal(t, int32(0), *drained.Spec.Replicas)
	assert.NotContains(t, drained.Annotations, AnnotationInlineDrainStartedAt)
}

func TestInlineDisableKeepsReconcilingAndDeletingPossible(t *testing.T) {
	tool := newInlineTool("disabled-delete")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, stored := reconcileInlineTool(t, r, tool)
	t.Setenv(inlinetools.EnabledEnvVar, "false")

	require.NoError(t, r.Delete(context.Background(), stored))
	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
	require.NoError(t, err)

	err = r.Get(context.Background(), types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace}, &arkv1alpha1.Tool{})
	assert.True(t, apierrors.IsNotFound(err), "cleanup must not need the feature enabled")
}

func TestInlineDrainIsANoOpForAnIdleRunner(t *testing.T) {
	tool := newInlineTool("idle")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, stored := reconcileInlineTool(t, r, tool)
	t.Setenv(inlinetools.EnabledEnvVar, "false")

	result, _ := reconcileInlineTool(t, r, stored)

	assert.Zero(t, result.RequeueAfter, "an already-idle runner needs no drain")
	deployment := inlineGetDeployment(t, r, "idle-runner")
	assert.Equal(t, int32(0), *deployment.Spec.Replicas)
	assert.NotContains(t, deployment.Annotations, AnnotationInlineDrainStartedAt)
}

func TestInlineDrainIgnoresAForeignDeployment(t *testing.T) {
	tool := newInlineTool("not-mine")
	unrelated := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "not-mine-runner", Namespace: inlineTestNamespace},
		Spec:       appsv1.DeploymentSpec{Replicas: ptr.To(int32(3))},
	}
	r := newInlineStatusReconciler(t, tool, unrelated)
	t.Setenv(inlinetools.EnabledEnvVar, "false")

	retry, err := r.drainInlineRunner(context.Background(), tool)

	require.NoError(t, err)
	assert.Zero(t, retry)
	assert.Equal(t, int32(3), *inlineGetDeployment(t, r, "not-mine-runner").Spec.Replicas)
}

func TestInlineFinalizeToleratesAVanishedTool(t *testing.T) {
	tool := newInlineTool("racing")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, stored := reconcileInlineTool(t, r, tool)
	require.NoError(t, r.Delete(context.Background(), stored))

	// Two reconciles for the same delete: the second finds nothing left.
	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
	require.NoError(t, err)

	_, err = r.finalizeInline(context.Background(), stored)
	assert.NoError(t, err, "losing the race is the intended end state, not an error")
}
