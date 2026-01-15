package routing

import (
	"context"
	"strings"
	"sync"

	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/trace"

	"mckinsey.com/ark/internal/telemetry"
)

type RoutingSpanProcessor struct {
	endpoints map[string]*ExporterConfig
	mu        sync.RWMutex
}

type ExporterConfig struct {
	Namespace string
	Exporter  trace.SpanExporter
	Processor trace.SpanProcessor
}

func NewRoutingSpanProcessor(ctx context.Context, endpoints []BrokerEndpoint) (*RoutingSpanProcessor, error) {
	rsp := &RoutingSpanProcessor{
		endpoints: make(map[string]*ExporterConfig),
	}

	for _, endpoint := range endpoints {
		otlpEndpoint := endpoint.Endpoint + "/v1/traces"
		exporter, err := createExporter(ctx, otlpEndpoint)
		if err != nil {
			log.Error(err, "failed to create exporter",
				"namespace", endpoint.Namespace,
				"endpoint", otlpEndpoint)
			continue
		}

		rsp.endpoints[endpoint.Namespace] = &ExporterConfig{
			Namespace: endpoint.Namespace,
			Exporter:  exporter,
			Processor: trace.NewBatchSpanProcessor(exporter),
		}

		log.Info("created broker exporter", "namespace", endpoint.Namespace)
	}

	return rsp, nil
}

func createExporter(ctx context.Context, endpoint string) (trace.SpanExporter, error) {
	host := extractHost(endpoint)
	path := extractPath(endpoint)

	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(host),
		otlptracehttp.WithURLPath(path),
		otlptracehttp.WithInsecure(),
	}

	return otlptracehttp.New(ctx, opts...)
}

func extractHost(url string) string {
	url = strings.TrimPrefix(url, "http://")
	url = strings.TrimPrefix(url, "https://")

	parts := strings.SplitN(url, "/", 2)
	return parts[0]
}

func extractPath(url string) string {
	url = strings.TrimPrefix(url, "http://")
	url = strings.TrimPrefix(url, "https://")

	parts := strings.SplitN(url, "/", 2)
	if len(parts) > 1 {
		return "/" + parts[1]
	}
	return "/"
}

func (r *RoutingSpanProcessor) OnStart(parent context.Context, s trace.ReadWriteSpan) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, config := range r.endpoints {
		config.Processor.OnStart(parent, s)
	}
}

func (r *RoutingSpanProcessor) OnEnd(s trace.ReadOnlySpan) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	queryNamespace := getStringAttribute(s, telemetry.AttrQueryNamespace)
	if queryNamespace == "" {
		return
	}

	if config, ok := r.endpoints[queryNamespace]; ok {
		config.Processor.OnEnd(s)
	}
}

func getStringAttribute(span trace.ReadOnlySpan, key string) string {
	for _, attr := range span.Attributes() {
		if string(attr.Key) == key {
			return attr.Value.AsString()
		}
	}
	return ""
}

func (r *RoutingSpanProcessor) Shutdown(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, config := range r.endpoints {
		if err := config.Processor.Shutdown(ctx); err != nil {
			log.Error(err, "failed to shutdown processor", "namespace", config.Namespace)
		}
	}
	return nil
}

func (r *RoutingSpanProcessor) ForceFlush(ctx context.Context) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, config := range r.endpoints {
		if err := config.Processor.ForceFlush(ctx); err != nil {
			log.Error(err, "failed to flush processor", "namespace", config.Namespace)
		}
	}
	return nil
}
