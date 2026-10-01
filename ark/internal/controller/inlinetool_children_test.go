/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

const (
	inlineTestNamespace = "team-a"
	inlineTestSource    = "print(1)\n"
)

func newInlineScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)
	return scheme
}

func newInlineTool(name string) *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: inlineTestNamespace,
			// Kubernetes UIDs are always 36 characters, which matters because the
			// UID is used as a label value.
			UID: types.UID(uuidFor(name)),
		},
		Spec: arkv1alpha1.ToolSpec{
			Type:   arkv1alpha1.ToolTypeInline,
			Inline: &arkv1alpha1.InlineSpec{Source: inlineTestSource, Language: arkv1alpha1.InlineLanguagePython},
		},
	}
}

// newInlineReconciler configures the runner images the same way the chart does.
func newInlineReconciler(t *testing.T, objects ...client.Object) *ToolReconciler {
	t.Helper()
	t.Setenv(runner.EnvImageRepository, "ghcr.io/example/ark-inline-runner")
	t.Setenv(runner.EnvImageTag, "v1.2.3")
	scheme := newInlineScheme()
	return &ToolReconciler{
		Client: fake.NewClientBuilder().WithScheme(scheme).
			WithStatusSubresource(&arkv1alpha1.Tool{}).
			WithObjects(objects...).Build(),
		Scheme: scheme,
	}
}

func TestInlineChildrenAreCreatedAndOwned(t *testing.T) {
	tool := newInlineTool("csv-summarise")
	r := newInlineReconciler(t, tool)

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	names := inlineChildNames(tool.Name)
	assert.Equal(t, "csv-summarise-source", names.Source)
	assert.Equal(t, "csv-summarise-runner", names.Runner)

	for _, obj := range []client.Object{
		&corev1.ConfigMap{}, &corev1.ServiceAccount{}, &corev1.Service{},
		&networkingv1.NetworkPolicy{}, &appsv1.Deployment{},
	} {
		name := names.Runner
		if _, isConfigMap := obj.(*corev1.ConfigMap); isConfigMap {
			name = names.Source
		}
		key := types.NamespacedName{Name: name, Namespace: inlineTestNamespace}
		require.NoErrorf(t, r.Get(context.Background(), key, obj), "%T %s", obj, name)

		owner := metav1.GetControllerOf(obj)
		require.NotNilf(t, owner, "%T has no controller reference", obj)
		assert.Equal(t, tool.UID, owner.UID)
		assert.Equal(t, "Tool", owner.Kind)
		assert.Equal(t, string(tool.UID), obj.GetLabels()[LabelInlineToolUID])
		assert.Equal(t, tool.Name, obj.GetLabels()[LabelInlineTool])
	}
}

func TestInlineSourceConfigMapCarriesTheScript(t *testing.T) {
	tool := newInlineTool("word-count")
	r := newInlineReconciler(t, tool)

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	configMap := &corev1.ConfigMap{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: "word-count-source", Namespace: inlineTestNamespace,
	}, configMap))
	assert.Equal(t, inlineTestSource, configMap.Data[inlineSourceKey])
}

func TestInlineDeploymentIsHardenedAndIdle(t *testing.T) {
	tool := newInlineTool("hardened")
	r := newInlineReconciler(t, tool)

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	deployment := inlineGetDeployment(t, r, "hardened-runner")
	pod := deployment.Spec.Template.Spec
	container := pod.Containers[0]

	assert.Equal(t, int32(0), *deployment.Spec.Replicas, "an unused runner must cost no pods")
	assert.Equal(t, "ghcr.io/example/ark-inline-runner-python:v1.2.3", container.Image)
	assert.False(t, *pod.AutomountServiceAccountToken)
	assert.Equal(t, "hardened-runner", pod.ServiceAccountName)
	assert.True(t, *pod.SecurityContext.RunAsNonRoot)
	assert.Equal(t, int64(65532), *pod.SecurityContext.RunAsUser)
	assert.Equal(t, corev1.SeccompProfileTypeRuntimeDefault, pod.SecurityContext.SeccompProfile.Type)
	assert.True(t, *container.SecurityContext.ReadOnlyRootFilesystem)
	assert.False(t, *container.SecurityContext.AllowPrivilegeEscalation)
	assert.Equal(t, []corev1.Capability{"ALL"}, container.SecurityContext.Capabilities.Drop)
	assert.Empty(t, pod.HostNetwork)
	assert.Empty(t, pod.HostPID)
	assert.Empty(t, pod.HostIPC)

	assert.Equal(t, "500m", container.Resources.Limits.Cpu().String())
	assert.Equal(t, "256Mi", container.Resources.Limits.Memory().String())
	assert.Equal(t, "50m", container.Resources.Requests.Cpu().String())
	assert.Equal(t, "64Mi", container.Resources.Requests.Memory().String())
	assert.True(t, container.Resources.Requests.Cpu().Cmp(*container.Resources.Limits.Cpu()) < 0,
		"requests must be below limits or a cold start reserves the whole limit")

	for _, volume := range pod.Volumes {
		assert.Nil(t, volume.HostPath)
		assert.Nil(t, volume.Secret)
	}
	assert.Empty(t, container.EnvFrom)
	for _, env := range container.Env {
		assert.Nil(t, env.ValueFrom, "runner env must not read secrets")
	}
}

func TestInlineSourceIsMountedAsAPinnedSnapshot(t *testing.T) {
	tool := newInlineTool("snapshot")
	r := newInlineReconciler(t, tool)

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	deployment := inlineGetDeployment(t, r, "snapshot-runner")
	mount := deployment.Spec.Template.Spec.Containers[0].VolumeMounts[0]

	assert.Equal(t, "/tool/source.py", mount.MountPath)
	assert.Equal(t, "source.py", mount.SubPath, "a subPath mount is never updated in place")
	assert.True(t, mount.ReadOnly)

	hash := runner.SourceHash(inlineTestSource)
	assert.Equal(t, hash, deployment.Spec.Template.Annotations[AnnotationInlineSourceHash])
	for _, env := range deployment.Spec.Template.Spec.Containers[0].Env {
		if env.Name == runner.EnvSourceHash {
			assert.Equal(t, hash, env.Value, "the runner verifies the revision it was given")
		}
	}
}

func TestInlineNetworkPolicyDeniesEgressAndLimitsIngress(t *testing.T) {
	tool := newInlineTool("isolated")
	r := newInlineReconciler(t, tool)
	t.Setenv(EnvActivatorNamespace, "ark-system")

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	policy := &networkingv1.NetworkPolicy{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: "isolated-runner", Namespace: inlineTestNamespace,
	}, policy))

	assert.Contains(t, policy.Spec.PolicyTypes, networkingv1.PolicyTypeEgress)
	assert.Contains(t, policy.Spec.PolicyTypes, networkingv1.PolicyTypeIngress)
	assert.Empty(t, policy.Spec.Egress, "no egress rule with the egress policy type denies all egress")
	require.Len(t, policy.Spec.Ingress, 1)
	require.Len(t, policy.Spec.Ingress[0].From, 1)
	from := policy.Spec.Ingress[0].From[0]
	assert.Equal(t, activatorSelector(), from.PodSelector.MatchLabels)
	assert.Equal(t, "ark-system", from.NamespaceSelector.MatchLabels[corev1.LabelMetadataName])
}

func TestInlineServiceIsClusterIPOnly(t *testing.T) {
	tool := newInlineTool("internal-only")
	r := newInlineReconciler(t, tool)

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	service := &corev1.Service{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: "internal-only-runner", Namespace: inlineTestNamespace,
	}, service))

	assert.Equal(t, corev1.ServiceTypeClusterIP, service.Spec.Type)
	assert.Equal(t, int32(runner.Port), service.Spec.Ports[0].Port)
}

func TestInlineReconciliationIsIdempotent(t *testing.T) {
	tool := newInlineTool("repeatable")
	r := newInlineReconciler(t, tool)

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))
	before := inlineGetDeployment(t, r, "repeatable-runner").ResourceVersion

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))
	after := inlineGetDeployment(t, r, "repeatable-runner")

	assert.Equal(t, before, after.ResourceVersion, "a no-op reconcile must not rewrite children")

	configMaps := &corev1.ConfigMapList{}
	require.NoError(t, r.List(context.Background(), configMaps, client.InNamespace(inlineTestNamespace)))
	assert.Len(t, configMaps.Items, 1, "the source ConfigMap name is stable, so none accumulate")
}

func TestInlineSourceEditUpdatesInPlaceAndRollsTheTemplate(t *testing.T) {
	tool := newInlineTool("edited")
	r := newInlineReconciler(t, tool)
	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))
	firstHash := inlineGetDeployment(t, r, "edited-runner").Spec.Template.Annotations[AnnotationInlineSourceHash]

	tool.Spec.Inline.Source = "print(2)\n"
	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	configMaps := &corev1.ConfigMapList{}
	require.NoError(t, r.List(context.Background(), configMaps, client.InNamespace(inlineTestNamespace)))
	require.Len(t, configMaps.Items, 1)
	assert.Equal(t, "print(2)\n", configMaps.Items[0].Data[inlineSourceKey])
	assert.NotEqual(t, firstHash, inlineGetDeployment(t, r, "edited-runner").Spec.Template.Annotations[AnnotationInlineSourceHash])
}

func TestInlineReconciliationLeavesActiveReplicasAlone(t *testing.T) {
	tool := newInlineTool("active")
	r := newInlineReconciler(t, tool)
	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	// The activator is the only component that changes the active count.
	deployment := inlineGetDeployment(t, r, "active-runner")
	scaled := int32(1)
	deployment.Spec.Replicas = &scaled
	require.NoError(t, r.Update(context.Background(), deployment))

	require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))

	assert.Equal(t, int32(1), *inlineGetDeployment(t, r, "active-runner").Spec.Replicas,
		"ordinary reconciliation must not scale a runner to zero under a call")
}

func TestInlineChildrenAreNotAdoptedFromAnotherOwner(t *testing.T) {
	tool := newInlineTool("colliding")
	unrelated := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "colliding-source", Namespace: inlineTestNamespace},
		Data:       map[string]string{"unrelated": "content"},
	}
	r := newInlineReconciler(t, tool, unrelated)

	err := r.reconcileInlineChildren(context.Background(), tool)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not owned by tool colliding")

	existing := &corev1.ConfigMap{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: "colliding-source", Namespace: inlineTestNamespace,
	}, existing))
	assert.Equal(t, "content", existing.Data["unrelated"], "an unrelated resource must not be overwritten")
}

func TestInlineChildrenRequireConfiguredImages(t *testing.T) {
	tool := newInlineTool("unconfigured")
	r := newInlineReconciler(t, tool)
	t.Setenv(runner.EnvImageRepository, "")

	err := r.reconcileInlineChildren(context.Background(), tool)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "runner images are not configured")
}

func TestInlineChildNamesAreDeterministicAndLengthSafe(t *testing.T) {
	long := strings.Repeat("a", 200)
	other := long[:199] + "b"

	first := inlineChildNames(long)
	assert.Equal(t, first, inlineChildNames(long), "names must be stable across reconciles")
	assert.LessOrEqual(t, len(first.Runner), 63)
	assert.LessOrEqual(t, len(first.Source), 63)
	assert.True(t, strings.HasSuffix(first.Runner, "-runner"))
	assert.NotEqual(t, first.Runner, inlineChildNames(other).Runner,
		"two long names sharing a prefix must not collide")
}

func TestInlineChildrenMatchActivationIdentity(t *testing.T) {
	for _, name := range []string{"identity", strings.Repeat("a", 200)} {
		tool := newInlineTool(name)
		tool.Generation = 1
		r := newInlineReconciler(t, tool)
		require.NoError(t, r.reconcileInlineChildren(context.Background(), tool))
		deployment := inlineGetDeployment(t, r, inlineChildNames(name).Runner)
		service := &corev1.Service{}
		require.NoError(t, r.Get(context.Background(), client.ObjectKeyFromObject(deployment), service))
		// The fake API does not allocate child UIDs or Service IPs.
		deployment.UID, service.UID, service.Spec.ClusterIP = "deployment-uid", "service-uid", "10.43.0.1"
		tool.Status = arkv1alpha1.ToolStatus{
			State: arkv1alpha1.ToolStateReady, ResolvedAddress: inlinetools.ResolvedAddress("ark-system", tool),
			Conditions: []metav1.Condition{{
				Type: arkv1alpha1.ToolConditionAvailable, Status: metav1.ConditionTrue,
				Reason: arkv1alpha1.ToolReasonAvailable, ObservedGeneration: tool.Generation,
			}},
		}
		address, err := inlinetools.ResolveActivation(true, tool, tool.UID, tool.Name, "ark-system", deployment, service)
		require.NoError(t, err)
		assert.Contains(t, address, deployment.Name+"."+tool.Namespace+".svc.cluster.local:8080/mcp")
	}
}

func TestInlineLabelValuesStayWithinTheLimit(t *testing.T) {
	tool := newInlineTool(strings.Repeat("a", 200))

	for key, value := range inlineLabels(tool) {
		assert.LessOrEqualf(t, len(value), 63, "label %s", key)
	}
}

// uuidFor is a stable 36-character UID per tool name.
func uuidFor(name string) string {
	sum := sha256.Sum256([]byte(name))
	digest := hex.EncodeToString(sum[:])
	return digest[:8] + "-" + digest[8:12] + "-4" + digest[13:16] + "-8" + digest[17:20] + "-" + digest[20:32]
}

func inlineGetDeployment(t *testing.T, r *ToolReconciler, name string) *appsv1.Deployment {
	t.Helper()
	deployment := &appsv1.Deployment{}
	require.NoError(t, r.Get(context.Background(), types.NamespacedName{
		Name: name, Namespace: inlineTestNamespace,
	}, deployment))
	return deployment
}
