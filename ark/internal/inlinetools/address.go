/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"fmt"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// The activator is the single endpoint inline callers connect to. It is a
// singleton alongside the operator, and no Ingress or external Service is
// published for it.
const (
	ActivatorName = "ark-inline-activator"
	ActivatorPort = 8080
	// ActivatorRoutePrefix precedes the per-tool route segments.
	ActivatorRoutePrefix = "/mcp"
)

// ResolvedAddress is the per-tool activator route. The UID is part of the path
// so a route captured before a delete cannot reach the recreated Tool that took
// its name.
func ResolvedAddress(activatorNamespace string, tool *arkv1alpha1.Tool) string {
	return fmt.Sprintf("http://%s.%s.svc.cluster.local:%d%s/%s/%s/%s",
		ActivatorName, activatorNamespace, ActivatorPort, ActivatorRoutePrefix,
		tool.Namespace, tool.Name, tool.UID)
}

// ConnectionName is the pooled client identity for an inline Tool. Client pools
// key on server namespace and name alone, so the UID keeps an inline Tool from
// reusing the session of an MCPServer that shares its name.
func ConnectionName(tool *arkv1alpha1.Tool) string {
	return fmt.Sprintf("inline-%s-%s", tool.Name, tool.UID)
}

// PublishedEndpoint returns the activator address a caller may connect to, or
// an error when the Tool's status is missing, unavailable or stale.
func PublishedEndpoint(tool *arkv1alpha1.Tool) (string, error) {
	if tool == nil || tool.Spec.Type != arkv1alpha1.ToolTypeInline || tool.Spec.Inline == nil || tool.UID == "" || !tool.DeletionTimestamp.IsZero() {
		return "", fmt.Errorf("inline Tool is missing or deleting")
	}
	condition := meta.FindStatusCondition(tool.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
	if condition == nil || condition.Status != metav1.ConditionTrue || condition.Reason != arkv1alpha1.ToolReasonAvailable ||
		tool.Generation < 1 || condition.ObservedGeneration != tool.Generation || tool.Status.State != arkv1alpha1.ToolStateReady {
		return "", fmt.Errorf("inline Tool is not available for its current generation")
	}
	if tool.Status.ResolvedAddress == "" {
		return "", fmt.Errorf("inline Tool has no published activator endpoint")
	}
	return tool.Status.ResolvedAddress, nil
}
