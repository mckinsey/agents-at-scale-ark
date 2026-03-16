package routing

import (
	"context"
	"strings"

	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/trace"
)

type ExporterConfig struct {
	Namespace string
	Exporter  trace.SpanExporter
	Processor trace.SpanProcessor
}

func NewRoutingSpanProcessor(ctx context.Context, endpoints []BrokerEndpoint) (*NamespaceRoutingProcessor, error) {
	configs := make(map[string]*ExporterConfig)

	for _, endpoint := range endpoints {
		otlpEndpoint := endpoint.Endpoint + "/v1/traces"
		exporter, err := createExporter(ctx, otlpEndpoint)
		if err != nil {
			log.Error(err, "failed to create exporter",
				"namespace", endpoint.Namespace,
				"endpoint", otlpEndpoint)
			continue
		}

		configs[endpoint.Namespace] = &ExporterConfig{
			Namespace: endpoint.Namespace,
			Exporter:  exporter,
			Processor: trace.NewBatchSpanProcessor(exporter),
		}

		log.Info("created broker exporter", "namespace", endpoint.Namespace)
	}

	return NewNamespaceRoutingProcessor(configs), nil
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

func getStringAttribute(span trace.ReadOnlySpan, key string) string {
	for _, attr := range span.Attributes() {
		if string(attr.Key) == key {
			return attr.Value.AsString()
		}
	}
	return ""
}
