/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
)

// queryRecorder implements telemetry.QueryRecorder using OpenTelemetry.
type queryRecorder struct {
	tracer telemetry.Tracer
}

// NewQueryRecorder creates a new OTEL-backed query recorder.
func NewQueryRecorder(tracer telemetry.Tracer) telemetry.QueryRecorder {
	return &queryRecorder{
		tracer: tracer,
	}
}

func (r *queryRecorder) StartQuery(ctx context.Context, query *arkv1alpha1.Query, phase string) (context.Context, telemetry.Span) {
	ctx = SetQueryInContext(ctx, query)

	spanName := "query." + query.Name

	return r.tracer.Start(ctx, spanName,
		telemetry.WithSpanKind(telemetry.SpanKindChain),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrQueryPhase, phase),
			telemetry.String(telemetry.AttrServiceName, "ark"),
			telemetry.String(telemetry.AttrComponentName, "ark-controller"),
		),
	)
}

func (r *queryRecorder) StartTarget(ctx context.Context, targetType, targetName string) (context.Context, telemetry.Span) {
	spanName := "target." + targetName

	attrs := []telemetry.Attribute{
		telemetry.String(telemetry.AttrTargetType, targetType),
		telemetry.String(telemetry.AttrTargetName, targetName),
	}

	// Add Langfuse observation type for compatibility
	if observationType := mapTargetToObservationType(targetType); observationType != "" {
		attrs = append(attrs, telemetry.String(telemetry.AttrLangfuseType, observationType))
	}

	return r.tracer.Start(ctx, spanName, telemetry.WithAttributes(attrs...))
}

func (r *queryRecorder) RecordRootInput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryRootInput, content))
}

func (r *queryRecorder) RecordRootOutput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryRootOutput, content))
}

func (r *queryRecorder) RecordInput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryInput, content))
}

func (r *queryRecorder) RecordOutput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryOutput, content))
}

func (r *queryRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		// OpenTelemetry GenAI semantic conventions
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
		// Legacy attributes for backward compatibility
		telemetry.Int64("tokens.prompt", promptTokens),
		telemetry.Int64("tokens.completion", completionTokens),
		telemetry.Int64("tokens.total", totalTokens),
	)
}

func (r *queryRecorder) RecordSessionID(span telemetry.Span, sessionID string) {
	if sessionID != "" {
		span.SetAttributes(telemetry.String(telemetry.AttrSessionID, sessionID))
	}
}

func (r *queryRecorder) RecordConversationID(span telemetry.Span, conversationID string) {
	if conversationID != "" {
		span.SetAttributes(telemetry.String(telemetry.AttrConversationID, conversationID))
	}
}

func (r *queryRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *queryRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}

// mapTargetToObservationType maps ARK target types to Langfuse observation types.
func mapTargetToObservationType(targetType string) string {
	switch targetType {
	case telemetry.TargetTypeAgent:
		return telemetry.ObservationTypeAgent
	case telemetry.TargetTypeModel:
		return telemetry.ObservationTypeGeneration
	case telemetry.TargetTypeTool:
		return telemetry.ObservationTypeTool
	default:
		return ""
	}
}
