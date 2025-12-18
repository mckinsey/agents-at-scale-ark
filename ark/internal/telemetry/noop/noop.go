/* Copyright 2025. McKinsey & Company */

package noop

import (
	"context"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
)

// noopTracer is a zero-overhead tracer that does nothing.
type noopTracer struct{}

// NewTracer creates a no-op tracer.
func NewTracer() telemetry.Tracer {
	return &noopTracer{}
}

func (t *noopTracer) Start(ctx context.Context, spanName string, opts ...telemetry.SpanOption) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

// noopSpan is a zero-overhead span that does nothing.
// All methods are intentionally empty for zero-overhead no-op behavior.
type noopSpan struct{}

func (s *noopSpan) End()                                                    {}            //nolint:revive
func (s *noopSpan) SetAttributes(attributes ...telemetry.Attribute)         {}            //nolint:revive
func (s *noopSpan) RecordError(err error)                                   {}            //nolint:revive
func (s *noopSpan) SetStatus(status telemetry.Status, description string)   {}            //nolint:revive
func (s *noopSpan) AddEvent(name string, attributes ...telemetry.Attribute) {}            //nolint:revive
func (s *noopSpan) TraceID() string                                         { return "" } //nolint:revive
func (s *noopSpan) SpanID() string                                          { return "" } //nolint:revive

// noopQueryRecorder is a zero-overhead query recorder that does nothing.
// All methods are intentionally empty for zero-overhead no-op behavior.
type noopQueryRecorder struct{}

// NewQueryRecorder creates a no-op query recorder.
func NewQueryRecorder() telemetry.QueryRecorder {
	return &noopQueryRecorder{}
}

func (r *noopQueryRecorder) StartQuery(ctx context.Context, query *arkv1alpha1.Query, phase string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopQueryRecorder) StartTarget(ctx context.Context, targetType, targetName string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopQueryRecorder) RecordRootInput(span telemetry.Span, content string)  {} //nolint:revive
func (r *noopQueryRecorder) RecordRootOutput(span telemetry.Span, content string) {} //nolint:revive
func (r *noopQueryRecorder) RecordInput(span telemetry.Span, content string)      {} //nolint:revive
func (r *noopQueryRecorder) RecordOutput(span telemetry.Span, content string)     {} //nolint:revive
func (r *noopQueryRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
}                                                                                            //nolint:revive
func (r *noopQueryRecorder) RecordSessionID(span telemetry.Span, sessionID string)           {} //nolint:revive
func (r *noopQueryRecorder) RecordConversationID(span telemetry.Span, conversationID string) {} //nolint:revive
func (r *noopQueryRecorder) RecordSuccess(span telemetry.Span)                               {} //nolint:revive
func (r *noopQueryRecorder) RecordError(span telemetry.Span, err error)                      {} //nolint:revive

// noopAgentRecorder is a zero-overhead agent recorder that does nothing.
// All methods are intentionally empty for zero-overhead no-op behavior.
type noopAgentRecorder struct{}

// NewAgentRecorder creates a no-op agent recorder.
func NewAgentRecorder() telemetry.AgentRecorder {
	return &noopAgentRecorder{}
}

func (r *noopAgentRecorder) StartAgentExecution(ctx context.Context, agentName, namespace string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopAgentRecorder) StartLLMCall(ctx context.Context, modelName string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopAgentRecorder) StartToolCall(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopAgentRecorder) RecordToolResult(span telemetry.Span, result string) {} //nolint:revive
func (r *noopAgentRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
}                                                                       //nolint:revive
func (r *noopAgentRecorder) RecordSuccess(span telemetry.Span)          {} //nolint:revive
func (r *noopAgentRecorder) RecordError(span telemetry.Span, err error) {} //nolint:revive

type noopModelRecorder struct{}

func NewModelRecorder() telemetry.ModelRecorder {
	return &noopModelRecorder{}
}

func (r *noopModelRecorder) StartModelExecution(ctx context.Context, modelName, modelType string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopModelRecorder) StartModelProbe(ctx context.Context, modelName, modelNamespace string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopModelRecorder) RecordInput(span telemetry.Span, messages any) {} //nolint:revive
func (r *noopModelRecorder) RecordOutput(span telemetry.Span, output any)  {} //nolint:revive
func (r *noopModelRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
} //nolint:revive
func (r *noopModelRecorder) RecordModelDetails(span telemetry.Span, modelName, modelType string) {
}                                                                       //nolint:revive
func (r *noopModelRecorder) RecordSuccess(span telemetry.Span)          {} //nolint:revive
func (r *noopModelRecorder) RecordError(span telemetry.Span, err error) {} //nolint:revive

type noopToolRecorder struct{}

func NewToolRecorder() telemetry.ToolRecorder {
	return &noopToolRecorder{}
}

func (r *noopToolRecorder) StartToolExecution(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopToolRecorder) RecordToolResult(span telemetry.Span, result string) {} //nolint:revive
func (r *noopToolRecorder) RecordSuccess(span telemetry.Span)                   {} //nolint:revive
func (r *noopToolRecorder) RecordError(span telemetry.Span, err error)          {} //nolint:revive

type noopTeamRecorder struct{}

func NewTeamRecorder() telemetry.TeamRecorder {
	return &noopTeamRecorder{}
}

func (r *noopTeamRecorder) StartTeamExecution(ctx context.Context, teamName, namespace, strategy string, memberCount, maxTurns int) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopTeamRecorder) StartTurn(ctx context.Context, turn int, memberName, memberType string) (context.Context, telemetry.Span) {
	return ctx, &noopSpan{}
}

func (r *noopTeamRecorder) RecordTurnOutput(span telemetry.Span, messages any, messageCount int) {
} //nolint:revive
func (r *noopTeamRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
}                                                                      //nolint:revive
func (r *noopTeamRecorder) RecordSuccess(span telemetry.Span)          {} //nolint:revive
func (r *noopTeamRecorder) RecordError(span telemetry.Span, err error) {} //nolint:revive

type noopProvider struct{}

func NewProvider() *noopProvider {
	return &noopProvider{}
}

func (p *noopProvider) Tracer() telemetry.Tracer {
	return NewTracer()
}

func (p *noopProvider) QueryRecorder() telemetry.QueryRecorder {
	return NewQueryRecorder()
}

func (p *noopProvider) AgentRecorder() telemetry.AgentRecorder {
	return NewAgentRecorder()
}

func (p *noopProvider) ModelRecorder() telemetry.ModelRecorder {
	return NewModelRecorder()
}

func (p *noopProvider) ToolRecorder() telemetry.ToolRecorder {
	return NewToolRecorder()
}

func (p *noopProvider) TeamRecorder() telemetry.TeamRecorder {
	return NewTeamRecorder()
}

func (p *noopProvider) Shutdown() error {
	return nil
}
