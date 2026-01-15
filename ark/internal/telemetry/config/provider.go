/* Copyright 2025. McKinsey & Company */

package config

import (
	"context"
	"os"

	otelapi "go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"mckinsey.com/ark/internal/telemetry"
	"mckinsey.com/ark/internal/telemetry/noop"
	otelimpl "mckinsey.com/ark/internal/telemetry/otel"
	"mckinsey.com/ark/internal/telemetry/routing"
)

var log = logf.Log.WithName("telemetry.config")

// Provider manages telemetry lifecycle and provides tracers/recorders.
type Provider struct {
	tracer        telemetry.Tracer
	queryRecorder telemetry.QueryRecorder
	agentRecorder telemetry.AgentRecorder
	modelRecorder telemetry.ModelRecorder
	toolRecorder  telemetry.ToolRecorder
	teamRecorder  telemetry.TeamRecorder
	shutdown      func() error
}

func discoverBrokerProcessor(ctx context.Context, k8sClient client.Client) trace.SpanProcessor {
	brokerEndpoints, err := routing.DiscoverBrokerEndpoints(ctx, k8sClient)
	if err != nil {
		log.Error(err, "failed to discover broker endpoints")
		return nil
	}

	if len(brokerEndpoints) == 0 {
		log.Info("no broker OTEL endpoints discovered")
		return nil
	}

	namespaces := make([]string, 0, len(brokerEndpoints))
	for _, endpoint := range brokerEndpoints {
		namespaces = append(namespaces, endpoint.Namespace)
	}
	log.Info("discovered broker OTEL endpoints", "count", len(brokerEndpoints), "namespaces", namespaces)

	routingProcessor, err := routing.NewRoutingSpanProcessor(ctx, brokerEndpoints)
	if err != nil {
		log.Error(err, "failed to create routing processor")
		return nil
	}

	log.Info("routing processor configured", "brokers", len(brokerEndpoints))
	return routingProcessor
}

// NewProvider creates a telemetry provider based on configuration.
// If OTEL endpoint is not configured and no brokers discovered, returns a no-op provider.
func NewProvider(ctx context.Context, k8sClient client.Client) *Provider {
	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "ark-controller"
	}

	spanProcessors := []trace.SpanProcessor{}

	primaryEndpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if primaryEndpoint != "" {
		headers := os.Getenv("OTEL_EXPORTER_OTLP_HEADERS")
		log.Info("configuring primary OTEL endpoint", "endpoint", primaryEndpoint, "service", serviceName, "headers", headers)

		exporter, err := otlptracehttp.New(ctx)
		if err != nil {
			log.Error(err, "failed to create primary OTLP exporter")
		} else {
			spanProcessors = append(spanProcessors, trace.NewBatchSpanProcessor(exporter))
			log.Info("primary OTEL exporter configured")
		}
	}

	if k8sClient != nil {
		if processor := discoverBrokerProcessor(ctx, k8sClient); processor != nil {
			spanProcessors = append(spanProcessors, processor)
		}
	}

	if len(spanProcessors) == 0 {
		log.Info("no OTEL endpoints configured, using no-op telemetry")
		return newNoopProvider()
	}

	opts := []trace.TracerProviderOption{
		trace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
		)),
	}

	for _, processor := range spanProcessors {
		opts = append(opts, trace.WithSpanProcessor(processor))
	}

	tp := trace.NewTracerProvider(opts...)

	otelapi.SetTracerProvider(tp)

	sendStartupEvent(serviceName)

	tracer := otelimpl.NewTracer("ark/controller")
	queryRecorder := otelimpl.NewQueryRecorder(tracer)
	agentRecorder := otelimpl.NewAgentRecorder(tracer)
	modelRecorder := otelimpl.NewModelRecorder(tracer)
	toolRecorder := otelimpl.NewToolRecorder(tracer)
	teamRecorder := otelimpl.NewTeamRecorder(tracer)

	log.Info("OTEL telemetry initialized successfully", "exporters", len(spanProcessors))

	return &Provider{
		tracer:        tracer,
		queryRecorder: queryRecorder,
		agentRecorder: agentRecorder,
		modelRecorder: modelRecorder,
		toolRecorder:  toolRecorder,
		teamRecorder:  teamRecorder,
		shutdown: func() error {
			log.Info("shutting down telemetry")
			return tp.Shutdown(context.Background())
		},
	}
}

// newNoopProvider creates a no-op telemetry provider.
func newNoopProvider() *Provider {
	tracer := noop.NewTracer()
	queryRecorder := noop.NewQueryRecorder()
	agentRecorder := noop.NewAgentRecorder()
	modelRecorder := noop.NewModelRecorder()
	toolRecorder := noop.NewToolRecorder()
	teamRecorder := noop.NewTeamRecorder()

	return &Provider{
		tracer:        tracer,
		queryRecorder: queryRecorder,
		agentRecorder: agentRecorder,
		modelRecorder: modelRecorder,
		toolRecorder:  toolRecorder,
		teamRecorder:  teamRecorder,
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

// TeamRecorder returns the team recorder instance.
func (p *Provider) TeamRecorder() telemetry.TeamRecorder {
	return p.teamRecorder
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
