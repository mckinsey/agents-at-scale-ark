package routing

import (
	"context"

	"go.opentelemetry.io/otel/sdk/trace"
)

func NewTargetRoutingProcessor(ctx context.Context, endpoints []TargetEndpoint) (*NamespaceRoutingProcessor, error) {
	configs := make(map[string]*ExporterConfig)

	for _, endpoint := range endpoints {
		exporter, err := createTargetExporter(ctx, endpoint)
		if err != nil {
			log.Error(err, "failed to create target exporter",
				"namespace", endpoint.Namespace,
				"endpoint", endpoint.Endpoint)
			continue
		}

		configs[endpoint.Namespace] = &ExporterConfig{
			Namespace: endpoint.Namespace,
			Exporter:  exporter,
			Processor: trace.NewBatchSpanProcessor(exporter),
		}

		log.Info("created target exporter", "namespace", endpoint.Namespace)
	}

	return NewNamespaceRoutingProcessor(configs), nil
}
