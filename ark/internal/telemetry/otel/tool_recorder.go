/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"

	"mckinsey.com/ark/internal/telemetry"
)

type toolRecorder struct {
	tracer telemetry.Tracer
}

func NewToolRecorder(tracer telemetry.Tracer) telemetry.ToolRecorder {
	return &toolRecorder{
		tracer: tracer,
	}
}

func (r *toolRecorder) StartToolExecution(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, telemetry.Span) {
	return r.tracer.Start(ctx, "tool."+toolName,
		telemetry.WithSpanKind(telemetry.SpanKindTool),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrToolName, toolName),
			telemetry.String(telemetry.AttrToolType, toolType),
			telemetry.String("tool.id", toolID),
			telemetry.String(telemetry.AttrToolInput, arguments),
			telemetry.String(telemetry.AttrComponentName, "tool"),
			telemetry.String("type", telemetry.ObservationTypeTool),
			telemetry.String("name", toolName),
		),
	)
}

func (r *toolRecorder) RecordToolResult(span telemetry.Span, result string) {
	span.SetAttributes(telemetry.String(telemetry.AttrToolOutput, result))
}

func (r *toolRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *toolRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}
