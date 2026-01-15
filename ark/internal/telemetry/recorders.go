/* Copyright 2025. McKinsey & Company */

package telemetry

import (
	"context"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// QueryRecorder provides domain-specific telemetry for query execution.
// Encapsulates query lifecycle tracing with consistent attribute naming.
type QueryRecorder interface {
	// StartQuery begins tracing a query execution and sets the Query in context.
	StartQuery(ctx context.Context, query *arkv1alpha1.Query, phase string) (context.Context, Span)

	// StartTarget begins tracing a specific query target (agent, team, model, tool).
	StartTarget(ctx context.Context, targetType, targetName string) (context.Context, Span)

	// RecordRootInput sets the root input content on a span.
	RecordRootInput(span Span, content string)

	// RecordRootOutput sets the root output content on a span.
	RecordRootOutput(span Span, content string)

	// RecordInput sets the input content on a span.
	RecordInput(span Span, content string)

	// RecordOutput sets the output content on a span.
	RecordOutput(span Span, content string)

	// RecordTokenUsage records LLM token consumption.
	RecordTokenUsage(span Span, promptTokens, completionTokens, totalTokens int64)

	// RecordSessionID associates a span with a session for multi-query tracking.
	RecordSessionID(span Span, sessionID string)

	// RecordConversationID associates a span with a conversation for multi-query tracking.
	RecordConversationID(span Span, conversationID string)

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

	// StartModelProbe begins tracing a model availability probe.
	StartModelProbe(ctx context.Context, modelName, modelNamespace string) (context.Context, Span)

	// RecordInput records the input messages for the model call.
	RecordInput(span Span, messages any)

	// RecordOutput records the output message from the model.
	// Can accept a string (simple text) or openai.ChatCompletionMessage (with tool calls).
	RecordOutput(span Span, output any)

	// RecordTokenUsage records token consumption for the model call.
	RecordTokenUsage(span Span, promptTokens, completionTokens, totalTokens int64)

	// RecordModelDetails records model configuration. Provider is extracted from modelType.
	RecordModelDetails(span Span, modelName, modelType string)

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

// TeamRecorder provides domain-specific telemetry for team execution.
// Encapsulates team lifecycle, strategy execution, and member coordination tracing.
type TeamRecorder interface {
	// StartTeamExecution begins tracing a team execution.
	StartTeamExecution(ctx context.Context, teamName, namespace, strategy string, memberCount, maxTurns int) (context.Context, Span)

	// StartTurn begins tracing a single turn in team execution.
	StartTurn(ctx context.Context, turn int, memberName, memberType string) (context.Context, Span)

	// RecordTurnOutput records turn execution output messages.
	RecordTurnOutput(span Span, messages any, messageCount int)

	// RecordTokenUsage records token consumption for team execution.
	RecordTokenUsage(span Span, promptTokens, completionTokens, totalTokens int64)

	// RecordSuccess marks a span as successfully completed.
	RecordSuccess(span Span)

	// RecordError marks a span as failed with error details.
	RecordError(span Span, err error)
}

// Standardized attribute keys for ARK telemetry.
// Following OpenTelemetry semantic conventions where applicable.
const (
	// Query attributes
	AttrQueryName       = "query.name"
	AttrQueryNamespace  = "query.namespace"
	AttrQueryPhase      = "query.phase"
	AttrQueryInput      = "query.input"
	AttrQueryOutput     = "query.output"
	AttrQueryRootInput  = "input.value"
	AttrQueryRootOutput = "output.value"

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

	// Conversation tracking
	AttrConversationID = "conversation.id"

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
	TeamRecorder() TeamRecorder
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
