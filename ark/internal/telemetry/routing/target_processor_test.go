package routing

import (
	"bytes"
	"context"
	"testing"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
)

func TestNewTargetRoutingProcessor(t *testing.T) {
	tests := []struct {
		name      string
		endpoints []TargetEndpoint
		wantLen   int
	}{
		{
			name:      "empty endpoints",
			endpoints: []TargetEndpoint{},
			wantLen:   0,
		},
		{
			name:      "nil endpoints",
			endpoints: nil,
			wantLen:   0,
		},
		{
			name: "single valid endpoint",
			endpoints: []TargetEndpoint{
				{Namespace: "tenant-a", Endpoint: "http://collector:4318/v1/traces", TLS: false},
			},
			wantLen: 1,
		},
		{
			name: "multiple valid endpoints",
			endpoints: []TargetEndpoint{
				{Namespace: "tenant-a", Endpoint: "http://collector-a:4318", TLS: false},
				{Namespace: "tenant-b", Endpoint: "https://collector-b:443", TLS: true, Headers: "Authorization=Bearer token"},
			},
			wantLen: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			processor, err := NewTargetRoutingProcessor(ctx, tt.endpoints)
			if err != nil {
				t.Fatalf("NewTargetRoutingProcessor() error = %v", err)
			}
			if processor == nil {
				t.Fatal("NewTargetRoutingProcessor() returned nil")
			}
			if len(processor.endpoints) != tt.wantLen {
				t.Errorf("endpoints length = %d, want %d", len(processor.endpoints), tt.wantLen)
			}
		})
	}
}

func TestNewTargetRoutingProcessor_LogsOnSuccess(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := zap.New(zap.WriteTo(buf), zap.UseDevMode(true))
	logf.SetLogger(logger)
	log = logger.WithName("telemetry.routing")

	endpoints := []TargetEndpoint{
		{Namespace: "tenant-a", Endpoint: "http://collector:4318/v1/traces", TLS: false},
	}

	_, err := NewTargetRoutingProcessor(context.Background(), endpoints)
	if err != nil {
		t.Fatalf("NewTargetRoutingProcessor() error = %v", err)
	}

	logOutput := buf.String()
	if !bytes.Contains(buf.Bytes(), []byte("created target exporter")) {
		t.Errorf("expected info log 'created target exporter', got: %s", logOutput)
	}
	if !bytes.Contains(buf.Bytes(), []byte("tenant-a")) {
		t.Errorf("expected namespace 'tenant-a' in log, got: %s", logOutput)
	}
}
