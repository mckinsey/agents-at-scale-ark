/* Copyright 2025. McKinsey & Company */

package common

import (
	"net/http"
	"testing"
)

func TestNewHTTPClientForStreaming(t *testing.T) {
	client := NewHTTPClientForStreaming()

	transport, ok := client.Transport.(*http.Transport)
	if !ok {
		t.Fatal("expected *http.Transport")
	}

	if transport.DialContext == nil {
		t.Fatal("expected custom DialContext")
	}

	defaultTransport := http.DefaultTransport.(*http.Transport)
	if transport == defaultTransport {
		t.Fatal("expected cloned transport, got pointer to DefaultTransport")
	}
	if transport.MaxIdleConns != defaultTransport.MaxIdleConns {
		t.Errorf("expected MaxIdleConns %d, got %d", defaultTransport.MaxIdleConns, transport.MaxIdleConns)
	}
}

func TestNewHTTPClientForStreamingKeepAlive(t *testing.T) {
	if StreamingKeepAliveInterval.Seconds() != 60 {
		t.Errorf("expected keepalive interval 60s, got %v", StreamingKeepAliveInterval)
	}
}

func TestNewHTTPClientWithoutTracing(t *testing.T) {
	client := NewHTTPClientWithoutTracing()

	if client.Transport != http.DefaultTransport {
		t.Error("expected http.DefaultTransport")
	}
}
