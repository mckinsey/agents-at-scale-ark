/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"fmt"
	"maps"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

// ResolveActivation authorizes a backend identity, not a running pod. It neither
// scales nor connects: callers must still validate arguments and wait for the
// current revision to become ready. No caller-supplied backend URL is accepted.
func ResolveActivation(enabled bool, tool *arkv1alpha1.Tool, routeUID types.UID, calledName, activatorNamespace string, deployment *appsv1.Deployment, service *corev1.Service) (string, error) {
	if !enabled {
		return "", fmt.Errorf("inline tools are disabled")
	}
	if tool == nil || tool.Spec.Type != arkv1alpha1.ToolTypeInline || tool.Spec.Inline == nil || !tool.DeletionTimestamp.IsZero() {
		return "", fmt.Errorf("inline Tool is missing or deleting")
	}
	if tool.UID == "" || routeUID != tool.UID || calledName != tool.Name {
		return "", fmt.Errorf("inline Tool name or UID does not match the call")
	}
	condition := meta.FindStatusCondition(tool.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
	if condition == nil || condition.Status != metav1.ConditionTrue || condition.Reason != arkv1alpha1.ToolReasonAvailable ||
		tool.Generation < 1 || condition.ObservedGeneration != tool.Generation || tool.Status.State != arkv1alpha1.ToolStateReady {
		return "", fmt.Errorf("inline Tool is not available for its current generation")
	}
	if activatorNamespace == "" || tool.Status.ResolvedAddress != ResolvedAddress(activatorNamespace, tool) {
		return "", fmt.Errorf("inline Tool has no matching published activator endpoint")
	}
	if _, err := runner.Interpreter(tool.Spec.Inline.Language); err != nil {
		return "", err
	}
	if deployment == nil || service == nil || !ownedRunner(deployment, tool) || !ownedRunner(service, tool) {
		return "", fmt.Errorf("runner Deployment or Service is missing, deleting, or not owned by the current Tool")
	}
	wanted := RunnerLabels(tool)
	if !equality.Semantic.DeepEqual(deployment.Spec.Selector, &metav1.LabelSelector{MatchLabels: wanted}) ||
		!labels.SelectorFromSet(wanted).Matches(labels.Set(deployment.Spec.Template.Labels)) {
		return "", fmt.Errorf("runner Deployment does not select the current Tool identity")
	}
	hash := runner.SourceHash(tool.Spec.Inline.Source)
	if deployment.Spec.Template.Annotations[SourceHashAnnotation] != hash || len(deployment.Spec.Template.Spec.Containers) != 1 {
		return "", fmt.Errorf("runner Deployment does not carry the current source revision")
	}
	wantedEnv := map[string]string{runner.EnvToolName: tool.Name, runner.EnvLanguage: tool.Spec.Inline.Language, runner.EnvSourceHash: hash}
	seen := map[string]bool{}
	for _, env := range deployment.Spec.Template.Spec.Containers[0].Env {
		if value, required := wantedEnv[env.Name]; required {
			if seen[env.Name] || env.ValueFrom != nil || env.Value != value {
				return "", fmt.Errorf("runner Deployment has stale or ambiguous execution identity")
			}
			seen[env.Name] = true
		}
	}
	if len(seen) != len(wantedEnv) {
		return "", fmt.Errorf("runner Deployment is missing execution identity")
	}
	if service.Spec.Type != corev1.ServiceTypeClusterIP || service.Spec.ClusterIP == "" || service.Spec.ClusterIP == corev1.ClusterIPNone ||
		len(service.Spec.ExternalIPs) != 0 || !maps.Equal(service.Spec.Selector, wanted) || len(service.Spec.Ports) != 1 {
		return "", fmt.Errorf("runner Service is not the private backend for the current Tool")
	}
	port := service.Spec.Ports[0]
	if port.Port != runner.Port || port.Protocol != corev1.ProtocolTCP || port.TargetPort != intstr.FromInt32(runner.Port) {
		return "", fmt.Errorf("runner Service does not target the runner MCP port")
	}
	return fmt.Sprintf("http://%s.%s.svc.cluster.local:%d%s", service.Name, tool.Namespace, runner.Port, runner.MCPPath), nil
}

func ownedRunner(object metav1.Object, tool *arkv1alpha1.Tool) bool {
	owner := metav1.GetControllerOf(object)
	return object.GetUID() != "" && object.GetDeletionTimestamp().IsZero() &&
		object.GetNamespace() == tool.Namespace && object.GetName() == NamesFor(tool.Name).Runner &&
		owner != nil && owner.APIVersion == arkv1alpha1.GroupVersion.String() && owner.Kind == "Tool" && owner.Name == tool.Name && owner.UID == tool.UID &&
		labels.SelectorFromSet(RunnerLabels(tool)).Matches(labels.Set(object.GetLabels()))
}
