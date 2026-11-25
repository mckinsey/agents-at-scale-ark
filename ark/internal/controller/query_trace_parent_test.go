/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	otelimpl "mckinsey.com/ark/internal/telemetry/otel"
)

func queryWithAnnotations(values map[string]string) *arkv1alpha1.Query {
	return &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default", Annotations: values}}
}

func TestWithParentTraceFromAnnotations(t *testing.T) {
	t.Run("uses a valid traceparent as the remote parent", func(t *testing.T) {
		query := queryWithAnnotations(map[string]string{
			annotations.TraceParent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
			annotations.TraceState:  "vendor=value",
		})

		spanContext := trace.SpanContextFromContext(withParentTraceFromAnnotations(context.Background(), query))

		if !spanContext.IsValid() || !spanContext.IsRemote() {
			t.Fatalf("expected a valid remote span context, got %+v", spanContext)
		}
		if got := spanContext.TraceID().String(); got != "4bf92f3577b34da6a3ce929d0e0e4736" {
			t.Errorf("trace id = %s", got)
		}
		if got := spanContext.SpanID().String(); got != "00f067aa0ba902b7" {
			t.Errorf("span id = %s", got)
		}
		if got := spanContext.TraceState().Get("vendor"); got != "value" {
			t.Errorf("tracestate vendor = %q", got)
		}
	})

	t.Run("ignores a malformed traceparent", func(t *testing.T) {
		query := queryWithAnnotations(map[string]string{annotations.TraceParent: "not-a-traceparent"})

		if trace.SpanContextFromContext(withParentTraceFromAnnotations(context.Background(), query)).IsValid() {
			t.Fatal("expected no span context for a malformed traceparent")
		}
	})

	t.Run("leaves the context alone without the annotation", func(t *testing.T) {
		ctx := context.Background()

		if got := withParentTraceFromAnnotations(ctx, queryWithAnnotations(nil)); got != ctx {
			t.Fatal("expected the original context")
		}
	})
}

func TestDispatchSpanIsChildOfAnnotatedParent(t *testing.T) {
	recorder := tracetest.NewSpanRecorder()
	provider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	previous := otel.GetTracerProvider()
	otel.SetTracerProvider(provider)
	t.Cleanup(func() { otel.SetTracerProvider(previous) })

	query := queryWithAnnotations(map[string]string{
		annotations.TraceParent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
	})
	r := &QueryReconciler{Eventing: eventingconfig.NewProviderWithClient(context.Background(), nil)}

	ctx := r.initializeQueryExecutionContext(context.Background(), query)
	_, span := startDispatchSpan(ctx, otelimpl.NewTracer("test"), query)
	span.End()

	ended := recorder.Ended()
	if len(ended) != 1 {
		t.Fatalf("expected 1 span, got %d", len(ended))
	}
	dispatch := ended[0]
	if dispatch.Name() != "query.q.dispatch" {
		t.Errorf("span name = %s", dispatch.Name())
	}
	if got := dispatch.Parent().SpanID().String(); got != "00f067aa0ba902b7" {
		t.Errorf("parent span id = %s", got)
	}
	if got := dispatch.SpanContext().TraceID().String(); got != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("trace id = %s", got)
	}
}
