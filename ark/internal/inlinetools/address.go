/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"fmt"

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
