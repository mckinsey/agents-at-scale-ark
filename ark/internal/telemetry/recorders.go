/* Copyright 2025. McKinsey & Company */

package telemetry

import (
	"context"
)

// QueryRecorder provides domain-specific telemetry for query execution.
// Encapsulates query lifecycle tracing with consistent attribute naming.
type QueryRecorder interface {
	// StartQuery begins tracing a query execution.
	StartQuery(ctx context.Context, queryName, queryNamespace, phase string) (context.Context, Span)

	// StartTarget begins tracing a specific query target (agent, team, model, tool).
	StartTarget(ctx context.Context, targetType, targetName string) (context.Context, Span)

	// RecordInput sets the input content on a span.
	RecordInput(span Span, content string)

	// RecordOutput sets the output content on a span.
	RecordOutput(span Span, content string)

	// RecordMessages records input messages for multi-turn conversations.
	RecordMessages(span Span, messages []string)

	// RecordTokenUsage records LLM token consumption.
	RecordTokenUsage(span Span, promptTokens, completionTokens, totalTokens int64)

	// RecordModelDetails records model provider and configuration.
	RecordModelDetails(span Span, modelName, provider, modelType string)

	// RecordSessionID associates a span with a session for multi-query tracking.
	RecordSessionID(span Span, sessionID string)

	// RecordSuccess marks a span as successfully completed.
	RecordSuccess(span Span)

	// RecordError marks a span as failed with error details.
	RecordError(span Span, err error)
}

// AgentRecorder provides domain-specific telemetry for agent execution.
// Encapsulates agent lifecycle, LLM calls, and tool execution tracing.
type AgentRecorder interface {
	// StartAgentExecution begins tracing an agent execution.
	StartAgentExecution(ctx context.Context, agentName, namespace string) (context.Context, Span)

	// StartLLMCall begins tracing a model call within agent execution.
	StartLLMCall(ctx context.Context, modelName string) (context.Context, Span)

	// StartToolCall begins tracing a tool execution.
	StartToolCall(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, Span)

	// RecordToolResult records the tool execution result.
	RecordToolResult(span Span, result string)

	// RecordTokenUsage records token consumption for LLM calls.
	RecordTokenUsage(span Span, promptTokens, completionTokens, totalTokens int64)

	// RecordSuccess marks a span as successfully completed.
	RecordSuccess(span Span)

	// RecordError marks a span as failed with error details.
	RecordError(span Span, err error)
}

// ModelRecorder provides domain-specific telemetry for model execution.
// Encapsulates LLM call lifecycle and token usage tracking.
type ModelRecorder interface {
	// StartModelExecution begins tracing a model execution.
	StartModelExecution(ctx context.Context, modelName, modelType string) (context.Context, Span)

	// RecordInput records the input messages for the model call.
	RecordInput(span Span, messages []string)

	// RecordOutput records the output content from the model.
	RecordOutput(span Span, content string)

	// RecordTokenUsage records token consumption for the model call.
	RecordTokenUsage(span Span, promptTokens, completionTokens, totalTokens int64)

	// RecordModelDetails records model provider and configuration.
	RecordModelDetails(span Span, modelName, provider, modelType string)

	// RecordSuccess marks a span as successfully completed.
	RecordSuccess(span Span)

	// RecordError marks a span as failed with error details.
	RecordError(span Span, err error)
}

// ToolRecorder provides domain-specific telemetry for tool execution.
// Encapsulates tool call lifecycle and result tracking.
type ToolRecorder interface {
	// StartToolExecution begins tracing a tool execution.
	StartToolExecution(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, Span)

	// RecordToolResult records the tool execution result.
	RecordToolResult(span Span, result string)

	// RecordSuccess marks a span as successfully completed.
	RecordSuccess(span Span)

	// RecordError marks a span as failed with error details.
	RecordError(span Span, err error)
}

// Standardized attribute keys for ARK telemetry.
// Following OpenTelemetry semantic conventions where applicable.
const (
	// Query attributes
	AttrQueryName      = "query.name"
	AttrQueryNamespace = "query.namespace"
	AttrQueryPhase     = "query.phase"
	AttrQueryInput     = "query.input"
	AttrQueryOutput    = "query.output"

	// Target attributes
	AttrTargetType = "target.type"
	AttrTargetName = "target.name"

	// Agent attributes
	AttrAgentName = "agent.name"

	// Team attributes
	AttrTeamName = "team.name"

	// Model attributes (aligned with OpenTelemetry GenAI conventions)
	AttrModelName     = "llm.model.name"
	AttrModelProvider = "llm.model.provider"
	AttrModelType     = "llm.model.type"

	// Token usage (aligned with OpenTelemetry GenAI conventions)
	AttrTokensPrompt     = "gen_ai.usage.input_tokens"
	AttrTokensCompletion = "gen_ai.usage.output_tokens"
	AttrTokensTotal      = "gen_ai.usage.total_tokens"

	// Langfuse-specific attributes for compatibility
	AttrLangfuseModel    = "model"
	AttrLangfuseProvider = "provider"
	AttrLangfuseType     = "type"

	// Session tracking
	AttrSessionID = "session.id"

	// Tool attributes
	AttrToolName        = "tool.name"
	AttrToolType        = "tool.type"
	AttrToolInput       = "tool.input"
	AttrToolOutput      = "tool.output"
	AttrToolDescription = "tool.description"

	// Message attributes
	AttrMessagesInputCount = "messages.input_count"
	AttrMessagesInput      = "messages.input"
	AttrMessagesOutput     = "messages.output"

	// Service attributes
	AttrServiceName    = "service.name"
	AttrServiceVersion = "service.version"
	AttrComponentName  = "component"

	// Finish reason (aligned with OpenTelemetry GenAI conventions)
	AttrFinishReason = "gen_ai.completion.finish_reason"
)

// Provider is an interface for telemetry providers that can create recorders.
type Provider interface {
	Tracer() Tracer
	QueryRecorder() QueryRecorder
	AgentRecorder() AgentRecorder
	ModelRecorder() ModelRecorder
	ToolRecorder() ToolRecorder
	Shutdown() error
}

// Target types for query execution
const (
	TargetTypeAgent = "agent"
	TargetTypeTeam  = "team"
	TargetTypeModel = "model"
	TargetTypeTool  = "tool"
)

// Langfuse observation types for compatibility
const (
	ObservationTypeAgent      = "agent"
	ObservationTypeGeneration = "generation"
	ObservationTypeTool       = "tool"
)
