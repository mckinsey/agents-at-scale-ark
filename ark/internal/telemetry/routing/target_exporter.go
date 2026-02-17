package routing

import (
	"context"
	"strings"

	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/trace"
)

func createTargetExporter(ctx context.Context, config TargetEndpoint) (trace.SpanExporter, error) {
	host := extractHost(config.Endpoint)
	path := extractPath(config.Endpoint)

	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(host),
		otlptracehttp.WithURLPath(path),
	}

	if !config.TLS {
		opts = append(opts, otlptracehttp.WithInsecure())
	}

	if config.Headers != "" {
		headers := parseHeaders(config.Headers)
		if len(headers) > 0 {
			opts = append(opts, otlptracehttp.WithHeaders(headers))
		}
	}

	return otlptracehttp.New(ctx, opts...)
}

func parseHeaders(headersStr string) map[string]string {
	headers := make(map[string]string)

	pairs := strings.Split(headersStr, ",")
	for _, pair := range pairs {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}

		parts := strings.SplitN(pair, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		if key != "" && value != "" {
			headers[key] = value
		}
	}

	return headers
}
