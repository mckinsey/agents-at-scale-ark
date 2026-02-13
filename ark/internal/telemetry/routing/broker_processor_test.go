package routing

import (
	"context"
	"testing"
)

func TestNewRoutingSpanProcessor(t *testing.T) {
	tests := []struct {
		name      string
		endpoints []BrokerEndpoint
		wantLen   int
	}{
		{
			name:      "empty endpoints",
			endpoints: []BrokerEndpoint{},
			wantLen:   0,
		},
		{
			name:      "nil endpoints",
			endpoints: nil,
			wantLen:   0,
		},
		{
			name: "creates processor for valid endpoint",
			endpoints: []BrokerEndpoint{
				{Namespace: "tenant-a", Endpoint: "http://collector:4318"},
			},
			wantLen: 1,
		},
		{
			name: "creates processors for multiple endpoints",
			endpoints: []BrokerEndpoint{
				{Namespace: "tenant-a", Endpoint: "http://collector-a:4318"},
				{Namespace: "tenant-b", Endpoint: "http://collector-b:4318"},
			},
			wantLen: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			processor, err := NewRoutingSpanProcessor(context.Background(), tt.endpoints)
			if err != nil {
				t.Fatalf("NewRoutingSpanProcessor() error = %v", err)
			}
			if processor == nil {
				t.Fatal("NewRoutingSpanProcessor() returned nil")
			}
			if len(processor.endpoints) != tt.wantLen {
				t.Errorf("endpoints length = %d, want %d", len(processor.endpoints), tt.wantLen)
			}
		})
	}
}

func TestCreateExporter(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		wantErr  bool
	}{
		{
			name:     "creates exporter for http endpoint",
			endpoint: "http://collector:4318/v1/traces",
		},
		{
			name:     "creates exporter for https endpoint",
			endpoint: "https://collector:4318/v1/traces",
		},
		{
			name:     "creates exporter without path",
			endpoint: "http://collector:4318",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			exporter, err := createExporter(context.Background(), tt.endpoint)
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("createExporter() error = %v", err)
			}
			if exporter == nil {
				t.Error("createExporter() returned nil exporter")
			}
		})
	}
}

func TestExtractHostAndPath(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		wantHost string
		wantPath string
	}{
		{
			name:     "http with port and path",
			url:      "http://collector:4318/v1/traces",
			wantHost: "collector:4318",
			wantPath: "/v1/traces",
		},
		{
			name:     "https with port and path",
			url:      "https://collector:4318/v1/traces",
			wantHost: "collector:4318",
			wantPath: "/v1/traces",
		},
		{
			name:     "without path",
			url:      "http://collector:4318",
			wantHost: "collector:4318",
			wantPath: "/",
		},
		{
			name:     "with nested path",
			url:      "http://collector:4318/api/v1/traces",
			wantHost: "collector:4318",
			wantPath: "/api/v1/traces",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotHost := extractHost(tt.url)
			gotPath := extractPath(tt.url)

			if gotHost != tt.wantHost {
				t.Errorf("extractHost() = %s, want %s", gotHost, tt.wantHost)
			}
			if gotPath != tt.wantPath {
				t.Errorf("extractPath() = %s, want %s", gotPath, tt.wantPath)
			}
		})
	}
}

func TestGetStringAttribute(t *testing.T) {
	span := createTestSpan("test-namespace")

	got := getStringAttribute(span, "query.namespace")
	if got != "test-namespace" {
		t.Errorf("getStringAttribute() = %s, want test-namespace", got)
	}

	got = getStringAttribute(span, "nonexistent")
	if got != "" {
		t.Errorf("getStringAttribute() for nonexistent = %s, want empty", got)
	}
}
