/* Copyright 2025. McKinsey & Company */

package annotations

// ARK annotation prefix
const (
	ARKPrefix = "ark.mckinsey.com/"
)

// Dashboard annotations
const (
	DashboardIcon = ARKPrefix + "dashboard-icon"
)

// A2A annotations
const (
	A2AServerName    = ARKPrefix + "a2a-server-name"
	A2AServerAddress = ARKPrefix + "a2a-server-address"
	A2AServerSkills  = ARKPrefix + "a2a-server-skills"
	A2AContextID     = ARKPrefix + "a2a-context-id"
)

// MCP annotations
const (
	MCPServerSettings = ARKPrefix + "mcp-server-settings"
)

// ARK service annotations
const (
	Service   = ARKPrefix + "service"
	Resources = ARKPrefix + "resources"
)

// Evaluation annotations
const (
	Evaluator       = ARKPrefix + "evaluator"
	Query           = ARKPrefix + "query"
	Auto            = ARKPrefix + "auto"
	QueryGeneration = ARKPrefix + "query-generation"
	QueryPhase      = ARKPrefix + "query-phase"
)

// General annotations
const (
	Finalizer            = ARKPrefix + "finalizer"
	TriggeredFrom        = ARKPrefix + "triggered-from"
	LocalhostGatewayPort = ARKPrefix + "localhost-gateway-port"
)

// Event annotations
const (
	EventData = ARKPrefix + "event-data"
)

// Streaming annotations
const (
	StreamingEnabled = ARKPrefix + "streaming-enabled"
	StreamingURL     = ARKPrefix + "streaming-url"
)

// Migration annotations - used by mutating webhooks to record deprecation warnings.
// The validating webhook collects annotations matching this prefix and returns them
// as admission warnings.
const (
	MigrationWarningPrefix = ARKPrefix + "migration-warning-"
)
