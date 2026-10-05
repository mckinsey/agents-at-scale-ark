/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"fmt"
	"os"

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

	// EnvActivatorNamespace names the environment variable carrying the
	// namespace the activator runs in. The controller (which computes
	// resolvedAddress) and the completions executor (which validates it
	// before connecting) must resolve the same value.
	EnvActivatorNamespace     = "ARK_INLINE_ACTIVATOR_NAMESPACE"
	defaultActivatorNamespace = "ark-system"
)

// ActivatorNamespaceFromEnv resolves the namespace the activator runs in.
func ActivatorNamespaceFromEnv() string {
	if ns := os.Getenv(EnvActivatorNamespace); ns != "" {
		return ns
	}
	return defaultActivatorNamespace
}

// ActivatorBaseURL is the activator's own address, with no per-tool route
// appended yet.
func ActivatorBaseURL(activatorNamespace string) string {
	return fmt.Sprintf("http://%s.%s.svc.cluster.local:%d%s", ActivatorName, activatorNamespace, ActivatorPort, ActivatorRoutePrefix)
}

// ResolvedAddress is the per-tool activator route under base (normally
// ActivatorBaseURL(activatorNamespace)). The UID is part of the path so a
// route captured before a delete cannot reach the recreated Tool that took
// its name.
func ResolvedAddress(base string, tool *arkv1alpha1.Tool) string {
	return fmt.Sprintf("%s/%s/%s/%s", base, tool.Namespace, tool.Name, tool.UID)
}

// ConnectionName is the pooled client identity for an inline Tool. Client pools
// key on server namespace and name alone, so the UID keeps an inline Tool from
// reusing the session of an MCPServer that shares its name.
func ConnectionName(tool *arkv1alpha1.Tool) string {
	return fmt.Sprintf("inline-%s-%s", tool.Name, tool.UID)
}

// PublishedEndpoint returns the activator address a caller may connect to, or
// an error when the Tool's status is missing, unavailable, stale, or does not
// match expected — the canonical endpoint the caller computed for this Tool
// (normally ResolvedAddress(ActivatorBaseURL(activatorNamespace), tool)).
// Comparing against a caller-computed value, rather than trusting whatever is
// stored, means a corrupted or forged status.resolvedAddress cannot redirect
// a connecting caller elsewhere.
func PublishedEndpoint(expected string, tool *arkv1alpha1.Tool) (string, error) {
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
	if expected == "" || tool.Status.ResolvedAddress != expected {
		return "", fmt.Errorf("inline Tool's published endpoint does not match the canonical activator address")
	}
	return tool.Status.ResolvedAddress, nil
}
