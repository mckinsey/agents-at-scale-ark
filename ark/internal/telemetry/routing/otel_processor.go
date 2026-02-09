package routing

import (
	"context"
	"sync"

	"go.opentelemetry.io/otel/sdk/trace"

	"mckinsey.com/ark/internal/telemetry"
)

type OTELRoutingProcessor struct {
	endpoints map[string]*ExporterConfig
	mu        sync.RWMutex
}

func NewOTELRoutingProcessor(ctx context.Context, endpoints []OTELEndpoint) (*OTELRoutingProcessor, error) {
	orp := &OTELRoutingProcessor{
		endpoints: make(map[string]*ExporterConfig),
	}

	for _, endpoint := range endpoints {
		exporter, err := createOTELExporter(ctx, endpoint)
		if err != nil {
			log.Error(err, "failed to create OTEL exporter",
				"namespace", endpoint.Namespace,
				"endpoint", endpoint.Endpoint)
			continue
		}

		orp.endpoints[endpoint.Namespace] = &ExporterConfig{
			Namespace: endpoint.Namespace,
			Exporter:  exporter,
			Processor: trace.NewBatchSpanProcessor(exporter),
		}

		log.Info("created per-tenant OTEL exporter", "namespace", endpoint.Namespace)
	}

	return orp, nil
}

func (r *OTELRoutingProcessor) OnStart(parent context.Context, s trace.ReadWriteSpan) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, config := range r.endpoints {
		config.Processor.OnStart(parent, s)
	}
}

func (r *OTELRoutingProcessor) OnEnd(s trace.ReadOnlySpan) {
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

func (r *OTELRoutingProcessor) Shutdown(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, config := range r.endpoints {
		if err := config.Processor.Shutdown(ctx); err != nil {
			log.Error(err, "failed to shutdown OTEL processor", "namespace", config.Namespace)
		}
	}
	return nil
}

func (r *OTELRoutingProcessor) ForceFlush(ctx context.Context) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, config := range r.endpoints {
		if err := config.Processor.ForceFlush(ctx); err != nil {
			log.Error(err, "failed to flush OTEL processor", "namespace", config.Namespace)
		}
	}
	return nil
}
