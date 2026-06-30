/* Copyright 2025. McKinsey & Company */

package common

import (
	"bytes"
	"io"
	"net"
	"net/http"
	"os"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

const QueryMessagesEndpointFmt = "/queries/%s/messages"

// LoggingTransport wraps an http.RoundTripper to provide optional HTTP request/response logging.
type LoggingTransport struct {
	Transport http.RoundTripper
}

// NewLoggingTransport creates a new LoggingTransport instrumented with OpenTelemetry.
func NewLoggingTransport(transport http.RoundTripper) *LoggingTransport {
	if transport == nil {
		transport = http.DefaultTransport
	}
	transport = otelhttp.NewTransport(transport,
		otelhttp.WithSpanNameFormatter(func(operation string, r *http.Request) string {
			return "HTTP"
		}),
	)
	return &LoggingTransport{Transport: transport}
}

// RoundTrip implements http.RoundTripper with optional logging (ENABLE_HTTP_LOGGING=true).
func (lt *LoggingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if os.Getenv("ENABLE_HTTP_LOGGING") != "true" {
		return lt.Transport.RoundTrip(req)
	}

	logger := logf.FromContext(req.Context())

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

// NewHTTPClientWithLogging creates an HTTP client with OTel-instrumented logging transport.
func NewHTTPClientWithLogging() *http.Client {
	return &http.Client{
		Transport: NewLoggingTransport(nil),
	}
}

// NewSharedTransport returns an http.Transport with a connection pool suitable for reuse
// across the lifetime of a provider or executor component.
func NewSharedTransport() *http.Transport {
	return &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	}
}

// NewHTTPClientWithoutTracing creates an HTTP client without OpenTelemetry instrumentation.
// Use this for health checks, probes, and other operations that should not generate traces.
func NewHTTPClientWithoutTracing() *http.Client {
	return &http.Client{
		Transport: http.DefaultTransport,
	}
}

const StreamingKeepAliveInterval = 60 * time.Second

func NewHTTPClientForStreaming() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: StreamingKeepAliveInterval,
	}).DialContext
	return &http.Client{
		Transport: transport,
	}
}
