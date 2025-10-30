/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"

	"mckinsey.com/ark/internal/telemetry"
)

// agentRecorder implements telemetry.AgentRecorder using OpenTelemetry.
type agentRecorder struct {
	tracer telemetry.Tracer
}

// NewAgentRecorder creates a new OTEL-backed agent recorder.
func NewAgentRecorder(tracer telemetry.Tracer) telemetry.AgentRecorder {
	return &agentRecorder{
		tracer: tracer,
	}
}

// StartAgentExecution begins tracing an agent execution.
func (r *agentRecorder) StartAgentExecution(ctx context.Context, agentName, namespace string) (context.Context, telemetry.Span) {
	spanName := "agent." + namespace + "/" + agentName
	return r.tracer.Start(ctx, spanName,
		telemetry.WithSpanKind(telemetry.SpanKindAgent),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrAgentName, agentName),
			telemetry.String(telemetry.AttrQueryNamespace, namespace),
			telemetry.String(telemetry.AttrComponentName, "agent"),
			// Langfuse compatibility
			telemetry.String("type", telemetry.ObservationTypeAgent),
			telemetry.String("name", agentName),
		),
	)
}

// StartLLMCall begins tracing a model call within agent execution.
func (r *agentRecorder) StartLLMCall(ctx context.Context, modelName string) (context.Context, telemetry.Span) {
	return r.tracer.Start(ctx, "llm.call",
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrModelName, modelName),
			telemetry.String(telemetry.AttrComponentName, "llm"),
			// Langfuse compatibility
			telemetry.String("type", telemetry.ObservationTypeGeneration),
			telemetry.String(telemetry.AttrLangfuseModel, modelName),
		),
	)
}

// StartToolCall begins tracing a tool execution.
func (r *agentRecorder) StartToolCall(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, telemetry.Span) {
	return r.tracer.Start(ctx, "tool.execution",
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrToolName, toolName),
			telemetry.String(telemetry.AttrToolType, toolType),
			telemetry.String("tool.id", toolID),
			telemetry.String(telemetry.AttrToolInput, arguments),
			telemetry.String(telemetry.AttrComponentName, "tool"),
			// Langfuse compatibility
			telemetry.String("type", telemetry.ObservationTypeTool),
			telemetry.String("name", toolName),
		),
	)
}

// RecordToolResult records the tool execution result.
func (r *agentRecorder) RecordToolResult(span telemetry.Span, result string) {
	span.SetAttributes(telemetry.String(telemetry.AttrToolOutput, result))
}

// RecordTokenUsage records token consumption for LLM calls.
func (r *agentRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

// RecordSuccess marks a span as successfully completed.
func (r *agentRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

// RecordError marks a span as failed with error details.
func (r *agentRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}
