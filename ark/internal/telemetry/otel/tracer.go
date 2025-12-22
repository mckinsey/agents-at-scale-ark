/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
)

const (
	defaultTracerName = "ark/controller"
)

// tracer implements telemetry.Tracer using OpenTelemetry.
type tracer struct {
	otelTracer trace.Tracer
}

// NewTracer creates a new OTEL-backed tracer.
func NewTracer(name string) telemetry.Tracer {
	if name == "" {
		name = defaultTracerName
	}
	return &tracer{
		otelTracer: otel.Tracer(name),
	}
}

// Start creates a new span using the OTEL tracer.
func (t *tracer) Start(ctx context.Context, spanName string, opts ...telemetry.SpanOption) (context.Context, telemetry.Span) {
	// Apply span options to get configuration
	cfg := &telemetry.SpanConfig{}
	for _, opt := range opts {
		opt.ApplySpanOption(cfg)
	}

	// Convert telemetry options to OTEL options
	var otelOpts []trace.SpanStartOption

	// Add span kind
	if cfg.SpanKind != telemetry.SpanKindInternal {
		otelOpts = append(otelOpts, trace.WithSpanKind(convertSpanKind(cfg.SpanKind)))

		// Add OpenInference span kind attribute for Phoenix
		if spanKindAttr := getOpenInferenceSpanKind(cfg.SpanKind); spanKindAttr != "" {
			otelOpts = append(otelOpts, trace.WithAttributes(
				attribute.String("openinference.span.kind", spanKindAttr),
			))
		}
	}

	// Add timestamp
	if !cfg.Timestamp.IsZero() {
		otelOpts = append(otelOpts, trace.WithTimestamp(cfg.Timestamp))
	}

	// Add attributes
	if len(cfg.Attributes) > 0 {
		otelAttrs := make([]attribute.KeyValue, len(cfg.Attributes))
		for i, attr := range cfg.Attributes {
			otelAttrs[i] = convertAttribute(attr)
		}
		otelOpts = append(otelOpts, trace.WithAttributes(otelAttrs...))
	}

	// Automatically add query.name and query.namespace from context
	queryAttrs := extractQueryAttributesFromContext(ctx)
	if len(queryAttrs) > 0 {
		otelOpts = append(otelOpts, trace.WithAttributes(queryAttrs...))
	}

	// Start the span
	ctx, otelSpan := t.otelTracer.Start(ctx, spanName, otelOpts...)

	return ctx, &span{otelSpan: otelSpan}
}

// span implements telemetry.Span using OpenTelemetry.
type span struct {
	otelSpan trace.Span
}

func (s *span) End() {
	s.otelSpan.End()
}

func (s *span) SetAttributes(attributes ...telemetry.Attribute) {
	if len(attributes) == 0 {
		return
	}

	otelAttrs := make([]attribute.KeyValue, len(attributes))
	for i, attr := range attributes {
		otelAttrs[i] = convertAttribute(attr)
	}
	s.otelSpan.SetAttributes(otelAttrs...)
}

func (s *span) RecordError(err error) {
	s.otelSpan.RecordError(err)
	s.otelSpan.SetStatus(codes.Error, err.Error())
}

func (s *span) SetStatus(status telemetry.Status, description string) {
	otelCode := convertStatus(status)
	s.otelSpan.SetStatus(otelCode, description)
}

func (s *span) AddEvent(name string, attributes ...telemetry.Attribute) {
	if len(attributes) == 0 {
		s.otelSpan.AddEvent(name)
		return
	}

	otelAttrs := make([]attribute.KeyValue, len(attributes))
	for i, attr := range attributes {
		otelAttrs[i] = convertAttribute(attr)
	}
	s.otelSpan.AddEvent(name, trace.WithAttributes(otelAttrs...))
}

func (s *span) TraceID() string {
	return s.otelSpan.SpanContext().TraceID().String()
}

func (s *span) SpanID() string {
	return s.otelSpan.SpanContext().SpanID().String()
}

// Conversion helpers

func convertAttribute(attr telemetry.Attribute) attribute.KeyValue {
	switch v := attr.Value.(type) {
	case string:
		return attribute.String(attr.Key, v)
	case int:
		return attribute.Int(attr.Key, v)
	case int64:
		return attribute.Int64(attr.Key, v)
	case float64:
		return attribute.Float64(attr.Key, v)
	case bool:
		return attribute.Bool(attr.Key, v)
	case []string:
		return attribute.StringSlice(attr.Key, v)
	default:
		// Fallback to string representation
		return attribute.String(attr.Key, "")
	}
}

func convertSpanKind(kind telemetry.SpanKind) trace.SpanKind {
	switch kind {
	case telemetry.SpanKindClient:
		return trace.SpanKindClient
	case telemetry.SpanKindServer:
		return trace.SpanKindServer
	case telemetry.SpanKindProducer:
		return trace.SpanKindProducer
	case telemetry.SpanKindConsumer:
		return trace.SpanKindConsumer
	default:
		return trace.SpanKindInternal
	}
}

func convertStatus(status telemetry.Status) codes.Code {
	switch status {
	case telemetry.StatusOk:
		return codes.Ok
	case telemetry.StatusError:
		return codes.Error
	default:
		return codes.Unset
	}
}

// getOpenInferenceSpanKind maps custom span kinds to OpenInference span kinds for Phoenix.
// Phoenix recognizes: CHAIN, AGENT, LLM, TOOL, RETRIEVER, RERANKER, EMBEDDING
func getOpenInferenceSpanKind(kind telemetry.SpanKind) string {
	switch kind {
	case telemetry.SpanKindChain:
		return "CHAIN"
	case telemetry.SpanKindAgent:
		return "AGENT"
	case telemetry.SpanKindLLM:
		return "LLM"
	case telemetry.SpanKindTool:
		return "TOOL"
	default:
		return ""
	}
}

type contextKey string

const queryResourceKey contextKey = "ark.query.resource"

func extractQueryAttributesFromContext(ctx context.Context) []attribute.KeyValue {
	query := getQueryFromContext(ctx)
	if query == nil {
		return nil
	}

	return []attribute.KeyValue{
		attribute.String(telemetry.AttrQueryName, query.Name),
		attribute.String(telemetry.AttrQueryNamespace, query.Namespace),
	}
}

func getQueryFromContext(ctx context.Context) *arkv1alpha1.Query {
	if query, ok := ctx.Value(queryResourceKey).(*arkv1alpha1.Query); ok {
		return query
	}
	return nil
}

func SetQueryInContext(ctx context.Context, query *arkv1alpha1.Query) context.Context {
	return context.WithValue(ctx, queryResourceKey, query)
}
