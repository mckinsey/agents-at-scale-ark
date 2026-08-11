/* Copyright 2025. McKinsey & Company */

package common

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewSharedTransport(t *testing.T) {
	tr := NewSharedTransport()
	require.NotNil(t, tr)
	assert.Equal(t, 100, tr.MaxIdleConns)
	assert.Equal(t, 10, tr.MaxIdleConnsPerHost)
	assert.Equal(t, 90*time.Second, tr.IdleConnTimeout)
}

func TestNewLoggingTransport_NilTransport(t *testing.T) {
	lt := NewLoggingTransport(nil)
	require.NotNil(t, lt)
	require.NotNil(t, lt.Transport)
}

func TestNewLoggingTransport_NonNilTransport(t *testing.T) {
	inner := http.DefaultTransport
	lt := NewLoggingTransport(inner)
	require.NotNil(t, lt)
	require.NotNil(t, lt.Transport)
}

func TestNewHTTPClientWithLogging(t *testing.T) {
	client := NewHTTPClientWithLogging()
	require.NotNil(t, client)
	_, ok := client.Transport.(*LoggingTransport)
	assert.True(t, ok)
}

func TestLoggingTransport_RoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	defer srv.Close()

	lt := NewLoggingTransport(http.DefaultTransport)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL, nil)
	require.NoError(t, err)

	resp, err := lt.RoundTrip(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestLoggingTransport_RoundTrip_WithLogging(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "logged")
	}))
	defer srv.Close()

	t.Setenv("ENABLE_HTTP_LOGGING", "true")

	lt := NewLoggingTransport(http.DefaultTransport)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, srv.URL, strings.NewReader("body"))
	require.NoError(t, err)

	resp, err := lt.RoundTrip(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

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
