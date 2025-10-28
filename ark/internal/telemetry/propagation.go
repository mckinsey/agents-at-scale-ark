/* Copyright 2025. McKinsey & Company */

package telemetry

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/baggage"
	"go.opentelemetry.io/otel/propagation"
)

// InjectOTELHeaders injects OTEL trace context and session info into HTTP headers.
// This is used for propagating trace context across service boundaries.
func InjectOTELHeaders(ctx context.Context, headers map[string]string) {
	// Inject standard W3C trace context headers
	carrier := propagation.MapCarrier(headers)
	otel.GetTextMapPropagator().Inject(ctx, carrier)

	// Add session ID as custom header if present in baggage
	bag := baggage.FromContext(ctx)
	if sessionID := bag.Member("session.id").Value(); sessionID != "" {
		headers["X-Session-ID"] = sessionID
	}
}
