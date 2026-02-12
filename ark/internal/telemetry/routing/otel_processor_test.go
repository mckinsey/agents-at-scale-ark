package routing

import (
	"bytes"
	"context"
	"testing"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
)

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

func TestNewOTELRoutingProcessor_LogsOnSuccess(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := zap.New(zap.WriteTo(buf), zap.UseDevMode(true))
	logf.SetLogger(logger)
	log = logger.WithName("telemetry.routing")

	endpoints := []OTELEndpoint{
		{Namespace: "tenant-a", Endpoint: "http://collector:4318/v1/traces", TLS: false},
	}

	_, err := NewOTELRoutingProcessor(context.Background(), endpoints)
	if err != nil {
		t.Fatalf("NewOTELRoutingProcessor() error = %v", err)
	}

	logOutput := buf.String()
	if !bytes.Contains(buf.Bytes(), []byte("created per-tenant OTEL exporter")) {
		t.Errorf("expected info log 'created per-tenant OTEL exporter', got: %s", logOutput)
	}
	if !bytes.Contains(buf.Bytes(), []byte("tenant-a")) {
		t.Errorf("expected namespace 'tenant-a' in log, got: %s", logOutput)
	}
}
