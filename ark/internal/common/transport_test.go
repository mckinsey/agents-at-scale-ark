/* Copyright 2025. McKinsey & Company */

package common

import (
	"context"
	"errors"
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

type recordingRoundTripper struct {
	deadline    time.Time
	hasDeadline bool
	ctx         context.Context
	body        io.ReadCloser
	err         error
}

func (rt *recordingRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	rt.ctx = req.Context()
	rt.deadline, rt.hasDeadline = req.Context().Deadline()
	if rt.err != nil {
		return nil, rt.err
	}

	body := rt.body
	if body == nil {
		body = io.NopCloser(strings.NewReader(""))
	}
	return &http.Response{StatusCode: http.StatusOK, Body: body}, nil
}

func TestBackstopTransportLeavesCallerDeadlineUntouched(t *testing.T) {
	recorder := &recordingRoundTripper{}
	transport := &BackstopTransport{Base: recorder, Backstop: 30 * time.Minute}

	callerDeadline := time.Now().Add(time.Hour)
	ctx, cancel := context.WithDeadline(t.Context(), callerDeadline)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	require.True(t, recorder.hasDeadline)
	require.WithinDuration(t, callerDeadline, recorder.deadline, time.Second,
		"a caller asking for an hour must not be cut to the backstop")
}

func TestBackstopTransportBoundsDeadlinelessRequest(t *testing.T) {
	recorder := &recordingRoundTripper{}
	transport := &BackstopTransport{Base: recorder, Backstop: 30 * time.Minute}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	require.NoError(t, err)

	require.True(t, recorder.hasDeadline, "a request with no deadline must pick up the backstop")
	require.WithinDuration(t, time.Now().Add(30*time.Minute), recorder.deadline, time.Minute)

	require.NoError(t, recorder.ctx.Err(), "the deadline must outlive RoundTrip to cover the body read")
	require.NoError(t, resp.Body.Close())
	require.ErrorIs(t, recorder.ctx.Err(), context.Canceled, "closing the body must release the context")
}

func TestBackstopTransportNonPositiveBackstopDisablesBound(t *testing.T) {
	for _, backstop := range []time.Duration{0, -time.Second} {
		recorder := &recordingRoundTripper{}
		transport := &BackstopTransport{Base: recorder, Backstop: backstop}

		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid", nil)
		require.NoError(t, err)

		resp, err := transport.RoundTrip(req)
		require.NoError(t, err, "a non-positive backstop must not expire the request immediately")
		require.NoError(t, resp.Body.Close())
		require.False(t, recorder.hasDeadline, "a non-positive backstop must not add a deadline")
	}
}

func TestBackstopTransportReleasesContextOnError(t *testing.T) {
	recorder := &recordingRoundTripper{err: errors.New("dial failed")}
	transport := &BackstopTransport{Base: recorder, Backstop: 30 * time.Minute}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	if resp != nil {
		defer func() { _ = resp.Body.Close() }()
	}
	require.Error(t, err)
	require.Nil(t, resp)
	require.ErrorIs(t, recorder.ctx.Err(), context.Canceled)
}

func TestBackstopTransportNilBaseUsesDefault(t *testing.T) {
	transport := &BackstopTransport{Backstop: 30 * time.Minute}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "ok")
	}))
	defer srv.Close()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)
}
