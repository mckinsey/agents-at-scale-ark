/* Copyright 2025. McKinsey & Company */

package common

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"os"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

// LoggingTransport wraps an http.RoundTripper to provide optional HTTP request/response logging
type LoggingTransport struct {
	Transport http.RoundTripper
	Context   context.Context
}

// NewLoggingTransport creates a new LoggingTransport with the given context.
// The transport is automatically instrumented with OpenTelemetry for HTTP tracing.
func NewLoggingTransport(ctx context.Context, transport http.RoundTripper) *LoggingTransport {
	if transport == nil {
		transport = http.DefaultTransport
	}
	// Wrap with OpenTelemetry HTTP instrumentation for automatic HTTP span creation.
	// The otelhttp.NewTransport will automatically extract the trace context from the
	// request's context and create child spans for HTTP calls.
	transport = otelhttp.NewTransport(transport,
		otelhttp.WithSpanNameFormatter(func(operation string, r *http.Request) string {
			return "HTTP"
		}),
	)
	return &LoggingTransport{
		Transport: transport,
		Context:   ctx,
	}
}

// RoundTrip implements the http.RoundTripper interface with optional logging
// Logging is enabled when ENABLE_HTTP_LOGGING environment variable is set to "true"
func (lt *LoggingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if os.Getenv("ENABLE_HTTP_LOGGING") != "true" {
		return lt.Transport.RoundTrip(req)
	}

	logger := logf.FromContext(lt.Context)

	var requestBody []byte
	if req.Body != nil {
		requestBody, _ = io.ReadAll(req.Body)
		req.Body = io.NopCloser(bytes.NewReader(requestBody))
	}

	logger.Info("HTTP Request", "method", req.Method, "url", req.URL.String(), "body", string(requestBody))

	resp, err := lt.Transport.RoundTrip(req)
	if err != nil {
		logger.Error(err, "HTTP Request failed", "url", req.URL.String())
		return nil, err
	}

	var responseBody []byte
	if resp.Body != nil {
		responseBody, _ = io.ReadAll(resp.Body)
		resp.Body = io.NopCloser(bytes.NewReader(responseBody))
	}

	logger.Info("HTTP Response", "status", resp.Status, "body", string(responseBody))

	return resp, nil
}

// NewHTTPClientWithLogging creates an HTTP client with logging transport
func NewHTTPClientWithLogging(ctx context.Context) *http.Client {
	return &http.Client{
		Transport: NewLoggingTransport(ctx, nil),
	}
}

// NewHTTPClientWithoutTracing creates an HTTP client without OpenTelemetry instrumentation.
// Use this for health checks, probes, and other operations that should not generate traces.
func NewHTTPClientWithoutTracing() *http.Client {
	return &http.Client{
		Transport: http.DefaultTransport,
	}
}
