package routing

import (
	"context"
	"sync"

	"go.opentelemetry.io/otel/sdk/trace"

	"mckinsey.com/ark/internal/telemetry"
)

type NamespaceRoutingProcessor struct {
	endpoints map[string]*ExporterConfig
	mu        sync.RWMutex
}

func NewNamespaceRoutingProcessor(endpoints map[string]*ExporterConfig) *NamespaceRoutingProcessor {
	return &NamespaceRoutingProcessor{
		endpoints: endpoints,
	}
}

func (r *NamespaceRoutingProcessor) OnStart(parent context.Context, s trace.ReadWriteSpan) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, config := range r.endpoints {
		config.Processor.OnStart(parent, s)
	}
}

func (r *NamespaceRoutingProcessor) OnEnd(s trace.ReadOnlySpan) {
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

func (r *NamespaceRoutingProcessor) Shutdown(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, config := range r.endpoints {
		if err := config.Processor.Shutdown(ctx); err != nil {
			log.Error(err, "failed to shutdown processor", "namespace", config.Namespace)
		}
	}
	return nil
}

func (r *NamespaceRoutingProcessor) ForceFlush(ctx context.Context) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, config := range r.endpoints {
		if err := config.Processor.ForceFlush(ctx); err != nil {
			log.Error(err, "failed to flush processor", "namespace", config.Namespace)
		}
	}
	return nil
}
