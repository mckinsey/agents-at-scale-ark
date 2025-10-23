/* Copyright 2025. McKinsey & Company */

package config

import (
	"context"
	"os"

	otelapi "go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"mckinsey.com/ark/internal/telemetry"
	"mckinsey.com/ark/internal/telemetry/noop"
	otelimpl "mckinsey.com/ark/internal/telemetry/otel"
)

var log = logf.Log.WithName("telemetry.config")

// Provider manages telemetry lifecycle and provides tracers/recorders.
type Provider struct {
	tracer        telemetry.Tracer
	queryRecorder telemetry.QueryRecorder
	agentRecorder telemetry.AgentRecorder
	modelRecorder telemetry.ModelRecorder
	toolRecorder  telemetry.ToolRecorder
	shutdown      func() error
}

// NewProvider creates a telemetry provider based on configuration.
// If OTEL endpoint is not configured, returns a no-op provider.
func NewProvider() *Provider {
	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "ark-controller"
	}

	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	useStdout := true

	if endpoint == "" && !useStdout {
		log.Info("OTEL_EXPORTER_OTLP_ENDPOINT not set and OTEL_EXPORTER_STDOUT not enabled, using no-op telemetry")
		return newNoopProvider()
	}

	var exporters []trace.SpanExporter

	if endpoint != "" {
		if exporter := createOTLPExporter(endpoint, serviceName); exporter != nil {
			exporters = append(exporters, exporter)
		}
	}

	if useStdout {
		log.Info("initializing stdout exporter", "service", serviceName)
		stdoutExporter, err := stdouttrace.New(
			stdouttrace.WithPrettyPrint(),
			stdouttrace.WithWriter(os.Stdout),
		)
		if err != nil {
			log.Error(err, "failed to create stdout exporter")
		} else {
			exporters = append(exporters, stdoutExporter)
		}
	}

	if len(exporters) == 0 {
		log.Info("no valid exporters configured, falling back to no-op telemetry")
		return newNoopProvider()
	}

	spanProcessors := make([]trace.TracerProviderOption, 0, len(exporters)+1)
	for _, exp := range exporters {
		spanProcessors = append(spanProcessors, trace.WithBatcher(exp))
	}

	spanProcessors = append(spanProcessors, trace.WithResource(resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceName(serviceName),
	)))

	tp := trace.NewTracerProvider(spanProcessors...)

	otelapi.SetTracerProvider(tp)

	sendStartupEvent(serviceName)

	tracer := otelimpl.NewTracer("ark/controller")
	queryRecorder := otelimpl.NewQueryRecorder(tracer)
	agentRecorder := otelimpl.NewAgentRecorder(tracer)
	modelRecorder := otelimpl.NewModelRecorder(tracer)
	toolRecorder := otelimpl.NewToolRecorder(tracer)

	log.Info("OTEL telemetry initialized successfully")

	return &Provider{
		tracer:        tracer,
		queryRecorder: queryRecorder,
		agentRecorder: agentRecorder,
		modelRecorder: modelRecorder,
		toolRecorder:  toolRecorder,
		shutdown: func() error {
			log.Info("shutting down telemetry")
			return tp.Shutdown(context.Background())
		},
	}
}

// createOTLPExporter creates an OTLP exporter based on the configured protocol.
func createOTLPExporter(endpoint, serviceName string) trace.SpanExporter {
	headers := os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")
	protocol := os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL")
	if protocol == "" {
		protocol = "http/protobuf"
	}

	log.Info("initializing OTLP exporter", "endpoint", endpoint, "protocol", protocol, "service", serviceName, "headers", headers)

	var exporter trace.SpanExporter
	var err error

	if protocol == "grpc" {
		exporter, err = otlptracegrpc.New(context.Background())
	} else {
		exporter, err = otlptracehttp.New(context.Background())
	}

	if err != nil {
		log.Error(err, "failed to create OTLP exporter", "protocol", protocol)
		return nil
	}

	return exporter
}

// newNoopProvider creates a no-op telemetry provider.
func newNoopProvider() *Provider {
	tracer := noop.NewTracer()
	queryRecorder := noop.NewQueryRecorder()
	agentRecorder := noop.NewAgentRecorder()
	modelRecorder := noop.NewModelRecorder()
	toolRecorder := noop.NewToolRecorder()

	return &Provider{
		tracer:        tracer,
		queryRecorder: queryRecorder,
		agentRecorder: agentRecorder,
		modelRecorder: modelRecorder,
		toolRecorder:  toolRecorder,
		shutdown:      func() error { return nil },
	}
}

// Tracer returns the tracer instance.
func (p *Provider) Tracer() telemetry.Tracer {
	return p.tracer
}

// QueryRecorder returns the query recorder instance.
func (p *Provider) QueryRecorder() telemetry.QueryRecorder {
	return p.queryRecorder
}

// AgentRecorder returns the agent recorder instance.
func (p *Provider) AgentRecorder() telemetry.AgentRecorder {
	return p.agentRecorder
}

// ModelRecorder returns the model recorder instance.
func (p *Provider) ModelRecorder() telemetry.ModelRecorder {
	return p.modelRecorder
}

// ToolRecorder returns the tool recorder instance.
func (p *Provider) ToolRecorder() telemetry.ToolRecorder {
	return p.toolRecorder
}

// Shutdown gracefully shuts down the telemetry provider.
// Should be called during application shutdown.
func (p *Provider) Shutdown() error {
	return p.shutdown()
}

// sendStartupEvent sends a basic startup event to validate telemetry.
func sendStartupEvent(serviceName string) {
	tracer := otelapi.Tracer("ark/controller-startup")
	_, span := tracer.Start(context.Background(), "controller.startup")
	defer span.End()

	version := os.Getenv("VERSION")
	if version == "" {
		version = "dev"
	}

	span.SetAttributes(
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(version),
	)

	log.Info("sent controller startup telemetry event")
}
