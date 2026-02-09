package routing

import (
	"context"
	"sync"
	"testing"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"mckinsey.com/ark/internal/telemetry"
)

type mockSpanProcessor struct {
	mu           sync.Mutex
	onStartCalls int
	onEndCalls   int
	shutdownErr  error
	flushErr     error
}

func (m *mockSpanProcessor) OnStart(ctx context.Context, s trace.ReadWriteSpan) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onStartCalls++
}

func (m *mockSpanProcessor) OnEnd(s trace.ReadOnlySpan) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onEndCalls++
}

func (m *mockSpanProcessor) Shutdown(ctx context.Context) error {
	return m.shutdownErr
}

func (m *mockSpanProcessor) ForceFlush(ctx context.Context) error {
	return m.flushErr
}

func TestOTELRoutingProcessor_OnEnd(t *testing.T) {
	tenantA := &mockSpanProcessor{}
	tenantB := &mockSpanProcessor{}

	processor := &OTELRoutingProcessor{
		endpoints: map[string]*ExporterConfig{
			"tenant-a": {Namespace: "tenant-a", Processor: tenantA},
			"tenant-b": {Namespace: "tenant-b", Processor: tenantB},
		},
	}

	tests := []struct {
		name           string
		namespace      string
		wantTenantA    int
		wantTenantB    int
	}{
		{
			name:        "routes to tenant-a",
			namespace:   "tenant-a",
			wantTenantA: 1,
			wantTenantB: 0,
		},
		{
			name:        "routes to tenant-b",
			namespace:   "tenant-b",
			wantTenantA: 0,
			wantTenantB: 1,
		},
		{
			name:        "ignores unknown namespace",
			namespace:   "unknown",
			wantTenantA: 0,
			wantTenantB: 0,
		},
		{
			name:        "ignores empty namespace",
			namespace:   "",
			wantTenantA: 0,
			wantTenantB: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tenantA.onEndCalls = 0
			tenantB.onEndCalls = 0

			span := createTestSpan(tt.namespace)
			processor.OnEnd(span)

			if tenantA.onEndCalls != tt.wantTenantA {
				t.Errorf("tenant-a OnEnd calls = %d, want %d", tenantA.onEndCalls, tt.wantTenantA)
			}
			if tenantB.onEndCalls != tt.wantTenantB {
				t.Errorf("tenant-b OnEnd calls = %d, want %d", tenantB.onEndCalls, tt.wantTenantB)
			}
		})
	}
}

func TestOTELRoutingProcessor_OnStart(t *testing.T) {
	tenantA := &mockSpanProcessor{}
	tenantB := &mockSpanProcessor{}

	processor := &OTELRoutingProcessor{
		endpoints: map[string]*ExporterConfig{
			"tenant-a": {Namespace: "tenant-a", Processor: tenantA},
			"tenant-b": {Namespace: "tenant-b", Processor: tenantB},
		},
	}

	processor.OnStart(context.Background(), nil)

	if tenantA.onStartCalls != 1 {
		t.Errorf("tenant-a OnStart calls = %d, want 1", tenantA.onStartCalls)
	}
	if tenantB.onStartCalls != 1 {
		t.Errorf("tenant-b OnStart calls = %d, want 1", tenantB.onStartCalls)
	}
}

func TestOTELRoutingProcessor_Shutdown(t *testing.T) {
	tenantA := &mockSpanProcessor{}
	processor := &OTELRoutingProcessor{
		endpoints: map[string]*ExporterConfig{
			"tenant-a": {Namespace: "tenant-a", Processor: tenantA},
		},
	}

	err := processor.Shutdown(context.Background())
	if err != nil {
		t.Errorf("Shutdown() error = %v, want nil", err)
	}
}

func TestOTELRoutingProcessor_ForceFlush(t *testing.T) {
	tenantA := &mockSpanProcessor{}
	processor := &OTELRoutingProcessor{
		endpoints: map[string]*ExporterConfig{
			"tenant-a": {Namespace: "tenant-a", Processor: tenantA},
		},
	}

	err := processor.ForceFlush(context.Background())
	if err != nil {
		t.Errorf("ForceFlush() error = %v, want nil", err)
	}
}

func TestOTELRoutingProcessor_EmptyEndpoints(t *testing.T) {
	processor := &OTELRoutingProcessor{
		endpoints: make(map[string]*ExporterConfig),
	}

	processor.OnStart(context.Background(), nil)
	processor.OnEnd(createTestSpan("any-namespace"))

	if err := processor.Shutdown(context.Background()); err != nil {
		t.Errorf("Shutdown() error = %v", err)
	}
	if err := processor.ForceFlush(context.Background()); err != nil {
		t.Errorf("ForceFlush() error = %v", err)
	}
}

func createTestSpan(namespace string) trace.ReadOnlySpan {
	attrs := []attribute.KeyValue{}
	if namespace != "" {
		attrs = append(attrs, attribute.String(telemetry.AttrQueryNamespace, namespace))
	}
	return tracetest.SpanStub{Attributes: attrs}.Snapshot()
}

func TestNewOTELRoutingProcessor(t *testing.T) {
	tests := []struct {
		name      string
		endpoints []OTELEndpoint
		wantLen   int
	}{
		{
			name:      "empty endpoints",
			endpoints: []OTELEndpoint{},
			wantLen:   0,
		},
		{
			name:      "nil endpoints",
			endpoints: nil,
			wantLen:   0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			processor, err := NewOTELRoutingProcessor(ctx, tt.endpoints)
			if err != nil {
				t.Fatalf("NewOTELRoutingProcessor() error = %v", err)
			}
			if processor == nil {
				t.Fatal("NewOTELRoutingProcessor() returned nil")
			}
			if len(processor.endpoints) != tt.wantLen {
				t.Errorf("endpoints length = %d, want %d", len(processor.endpoints), tt.wantLen)
			}
		})
	}
}
