/* Copyright 2025. McKinsey & Company */

package labels

const (
	MCPServerLabel = "mcp/server"
	A2AServerLabel = "a2a/server"
	// ManagedBy marks a resource a controller created as a backstop rather
	// than one a Helm chart or a user owns.
	ManagedBy = "ark.mckinsey.com/managed-by"
	// ManagedByController is the ManagedBy value used by controller-created
	// backstop resources (e.g. the default Memory reconciler).
	ManagedByController = "ark-controller"
)
