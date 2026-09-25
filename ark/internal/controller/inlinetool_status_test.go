/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

const activatorTestNamespace = "ark-system"

func activatorDeployment(availableReplicas int32) *appsv1.Deployment {
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      inlinetools.ActivatorName,
			Namespace: activatorTestNamespace,
		},
		Status: appsv1.DeploymentStatus{AvailableReplicas: availableReplicas},
	}
}

// newInlineStatusReconciler wires the enabled feature, configured images and a
// reachable activator namespace, the way an install with inline tools on does.
func newInlineStatusReconciler(t *testing.T, objects ...client.Object) *ToolReconciler {
	t.Helper()
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	t.Setenv(EnvActivatorNamespace, activatorTestNamespace)
	return newInlineReconciler(t, objects...)
}

func reconcileInlineTool(t *testing.T, r *ToolReconciler, tool *arkv1alpha1.Tool) (ctrl.Result, *arkv1alpha1.Tool) {
	t.Helper()
	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
	require.NoError(t, err)

	updated := &arkv1alpha1.Tool{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: tool.Name, Namespace: tool.Namespace,
	}, updated))
	return result, updated
}

func availableCondition(t *testing.T, tool *arkv1alpha1.Tool) *metav1.Condition {
	t.Helper()
	condition := meta.FindStatusCondition(tool.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
	require.NotNil(t, condition)
	assert.Equal(t, tool.Generation, condition.ObservedGeneration,
		"the verdict must say which generation it applies to")
	return condition
}

func TestInlineToolIsAvailableWithoutAWarmRunner(t *testing.T) {
	tool := newInlineTool("ready-tool")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))

	_, updated := reconcileInlineTool(t, r, tool)

	condition := availableCondition(t, updated)
	assert.Equal(t, metav1.ConditionTrue, condition.Status)
	assert.Equal(t, arkv1alpha1.ToolReasonAvailable, condition.Reason)
	assert.Equal(t, arkv1alpha1.ToolStateReady, updated.Status.State)
	assert.Equal(t,
		"http://ark-inline-activator.ark-system.svc.cluster.local:8080/mcp/"+
			inlineTestNamespace+"/ready-tool/"+string(tool.UID),
		updated.Status.ResolvedAddress)

	// Available is about the endpoint and configuration, not a running pod.
	assert.Equal(t, int32(0), *inlineGetDeployment(t, r, "ready-tool-runner").Spec.Replicas)
}

func TestInlineToolReportsAnUnavailableActivator(t *testing.T) {
	cases := map[string]client.Object{
		"not installed":        nil,
		"no available replica": activatorDeployment(0),
	}
	for name, activator := range cases {
		t.Run(name, func(t *testing.T) {
			tool := newInlineTool("waiting")
			objects := []client.Object{tool}
			if activator != nil {
				objects = append(objects, activator)
			}
			r := newInlineStatusReconciler(t, objects...)

			result, updated := reconcileInlineTool(t, r, tool)

			condition := availableCondition(t, updated)
			assert.Equal(t, metav1.ConditionFalse, condition.Status)
			assert.Equal(t, arkv1alpha1.ToolReasonActivatorUnavailable, condition.Reason)
			assert.Equal(t, arkv1alpha1.ToolStatePending, updated.Status.State)
			assert.Empty(t, updated.Status.ResolvedAddress, "an unusable endpoint is not advertised")
			assert.Equal(t, inlineActivatorRetry, result.RequeueAfter, "the check must be retried")

			// The children are still reconciled: the Tool is provisioned and
			// waiting for its front door, not unprovisioned.
			assert.NotNil(t, inlineGetDeployment(t, r, "waiting-runner"))
		})
	}
}

func TestInlineToolReportsProvisioningFailure(t *testing.T) {
	tool := newInlineTool("broken")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	t.Setenv(runner.EnvImageTag, "")

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace},
	})
	require.Error(t, err, "a provisioning failure must be retried with backoff")

	updated := &arkv1alpha1.Tool{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: tool.Name, Namespace: tool.Namespace,
	}, updated))
	condition := availableCondition(t, updated)
	assert.Equal(t, arkv1alpha1.ToolReasonProvisioningFailed, condition.Reason)
	assert.Equal(t, arkv1alpha1.ToolStatePending, updated.Status.State)
	assert.Empty(t, updated.Status.ResolvedAddress)
}

func TestInlineToolReportsDisabledRuntime(t *testing.T) {
	tool := newInlineTool("disabled")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	t.Setenv(inlinetools.EnabledEnvVar, "false")

	_, updated := reconcileInlineTool(t, r, tool)

	condition := availableCondition(t, updated)
	assert.Equal(t, arkv1alpha1.ToolReasonRuntimeNotInstalled, condition.Reason)
	assert.Empty(t, updated.Status.ResolvedAddress)
}

func TestInlineDriftIsCorrectedAfterTheToolIsAvailable(t *testing.T) {
	tool := newInlineTool("drifting")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, updated := reconcileInlineTool(t, r, tool)
	require.Equal(t, arkv1alpha1.ToolStateReady, updated.Status.State)

	// Something edits a child by hand after the Tool is already available.
	configMap := &corev1.ConfigMap{}
	key := types.NamespacedName{Name: "drifting-source", Namespace: inlineTestNamespace}
	require.NoError(t, r.Get(context.Background(), key, configMap))
	configMap.Data[inlineSourceKey] = "print('tampered')"
	require.NoError(t, r.Update(context.Background(), configMap))

	_, _ = reconcileInlineTool(t, r, tool)

	require.NoError(t, r.Get(context.Background(), key, configMap))
	assert.Equal(t, inlineTestSource, configMap.Data[inlineSourceKey],
		"reconciliation must correct drift even when the tool is already available")
}

func TestInlineSourceEditRollsTheRunnerWhileAvailable(t *testing.T) {
	tool := newInlineTool("editable")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, _ = reconcileInlineTool(t, r, tool)
	firstHash := inlineGetDeployment(t, r, "editable-runner").Spec.Template.Annotations[AnnotationInlineSourceHash]

	stored := &arkv1alpha1.Tool{}
	key := types.NamespacedName{Name: tool.Name, Namespace: tool.Namespace}
	require.NoError(t, r.Get(context.Background(), key, stored))
	stored.Spec.Inline.Source = "print('edited')"
	stored.Generation = 2
	require.NoError(t, r.Update(context.Background(), stored))

	_, updated := reconcileInlineTool(t, r, stored)

	deployment := inlineGetDeployment(t, r, "editable-runner")
	newHash := deployment.Spec.Template.Annotations[AnnotationInlineSourceHash]
	assert.NotEqual(t, firstHash, newHash, "the pod template must roll so no pod serves stale source")
	assert.Equal(t, runner.SourceHash("print('edited')"), newHash)

	// The runner is told which revision it must find on disk; it refuses to
	// serve anything else, which is what stops a ConfigMap/template race from
	// executing the wrong script.
	var sourceHashEnv string
	for _, env := range deployment.Spec.Template.Spec.Containers[0].Env {
		if env.Name == runner.EnvSourceHash {
			sourceHashEnv = env.Value
		}
	}
	assert.Equal(t, newHash, sourceHashEnv)
	assert.Equal(t, updated.Generation, availableCondition(t, updated).ObservedGeneration)
}

func TestInlineStatusDoesNotChangeOtherToolTypes(t *testing.T) {
	httpTool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "fetch", Namespace: inlineTestNamespace, UID: "uid-http"},
		Spec: arkv1alpha1.ToolSpec{
			Type: arkv1alpha1.ToolTypeHTTP,
			HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "GET"},
		},
	}
	r := newInlineStatusReconciler(t, httpTool, activatorDeployment(1))

	_, updated := reconcileInlineTool(t, r, httpTool)

	assert.Equal(t, arkv1alpha1.ToolStateReady, updated.Status.State)
	assert.Equal(t, "Tool configuration is valid", updated.Status.Message)
	assert.Empty(t, updated.Status.Conditions, "non-inline tools keep their existing status shape")
	assert.Empty(t, updated.Status.ResolvedAddress)
}
