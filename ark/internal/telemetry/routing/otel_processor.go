package routing

import (
	"context"

	"go.opentelemetry.io/otel/sdk/trace"
)

func NewOTELRoutingProcessor(ctx context.Context, endpoints []OTELEndpoint) (*NamespaceRoutingProcessor, error) {
	configs := make(map[string]*ExporterConfig)

	for _, endpoint := range endpoints {
		exporter, err := createOTELExporter(ctx, endpoint)
		if err != nil {
			log.Error(err, "failed to create OTEL exporter",
				"namespace", endpoint.Namespace,
				"endpoint", endpoint.Endpoint)
			continue
		}

		configs[endpoint.Namespace] = &ExporterConfig{
			Namespace: endpoint.Namespace,
			Exporter:  exporter,
			Processor: trace.NewBatchSpanProcessor(exporter),
		}

		log.Info("created per-tenant OTEL exporter", "namespace", endpoint.Namespace)
	}

	return NewNamespaceRoutingProcessor(configs), nil
}
