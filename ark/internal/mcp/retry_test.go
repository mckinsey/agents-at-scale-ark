package mcp

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	"github.com/stretchr/testify/require"
)

func TestIsTransientHTTPStatus(t *testing.T) {
	for _, code := range []int{408, 425, 429, 500, 502, 503, 504, 599} {
		require.True(t, isTransientHTTPStatus(code), "status %d should be transient", code)
	}
	for _, code := range []int{200, 204, 301, 400, 401, 403, 404, 409, 422} {
		require.False(t, isTransientHTTPStatus(code), "status %d should not be transient", code)
	}
}

func TestParseRetryAfter(t *testing.T) {
	tests := map[string]struct {
		header string
		want   time.Duration
		ok     bool
	}{
		"empty":    {"", 0, false},
		"seconds":  {"2", 2 * time.Second, true},
		"zero":     {"0", 0, true},
		"negative": {"-5", 0, false},
		"garbage":  {"soon", 0, false},
		"pastDate": {time.Now().Add(-time.Hour).UTC().Format(http.TimeFormat), 0, false},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got, ok := parseRetryAfter(tc.header)
			require.Equal(t, tc.ok, ok)
			require.Equal(t, tc.want, got)
		})
	}

	t.Run("futureDate", func(t *testing.T) {
		got, ok := parseRetryAfter(time.Now().Add(10 * time.Second).UTC().Format(http.TimeFormat))
		require.True(t, ok)
		require.Greater(t, got, 5*time.Second)
		require.LessOrEqual(t, got, 10*time.Second)
	})
}

func TestToolCallBackoff(t *testing.T) {
	cfg := defaultRetryConfig()

	t.Run("exponentialGrowthWithJitterBounds", func(t *testing.T) {
		for attempt, base := range []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second, 4 * time.Second} {
			for range 200 {
				delay := toolCallBackoff(attempt, cfg, 0)
				require.GreaterOrEqual(t, delay, base*3/4, "attempt %d", attempt)
				require.LessOrEqual(t, delay, base*5/4, "attempt %d", attempt)
			}
		}
	})

	t.Run("jitterVaries", func(t *testing.T) {
		seen := map[time.Duration]bool{}
		for range 50 {
			seen[toolCallBackoff(2, cfg, 0)] = true
		}
		require.Greater(t, len(seen), 1)
	})

	t.Run("cappedAtMaxDelay", func(t *testing.T) {
		for range 100 {
			delay := toolCallBackoff(10, cfg, 0)
			require.LessOrEqual(t, delay, cfg.MaxDelay*5/4)
			require.GreaterOrEqual(t, delay, cfg.MaxDelay*3/4)
		}
	})

	t.Run("retryAfterIsFloor", func(t *testing.T) {
		for range 100 {
			delay := toolCallBackoff(0, cfg, 3*time.Second)
			require.GreaterOrEqual(t, delay, 3*time.Second)
		}
	})

	t.Run("retryAfterCappedAtMaxDelay", func(t *testing.T) {
		for range 100 {
			delay := toolCallBackoff(0, cfg, time.Hour)
			require.LessOrEqual(t, delay, cfg.MaxDelay)
		}
	})
}

func TestTransientCapture(t *testing.T) {
	t.Run("absentFromContext", func(t *testing.T) {
		require.Nil(t, transientCaptureFrom(context.Background()))
	})

	t.Run("recordAndTake", func(t *testing.T) {
		ctx, capture := withTransientCapture(context.Background())
		require.Same(t, capture, transientCaptureFrom(ctx))

		status, retryAfter, ok := capture.take()
		require.False(t, ok)
		require.Zero(t, status)
		require.Zero(t, retryAfter)

		capture.record(http.StatusTooManyRequests, 2*time.Second)
		status, retryAfter, ok = capture.take()
		require.True(t, ok)
		require.Equal(t, http.StatusTooManyRequests, status)
		require.Equal(t, 2*time.Second, retryAfter)

		_, _, ok = capture.take()
		require.False(t, ok)
	})

	t.Run("concurrentAccess", func(t *testing.T) {
		_, capture := withTransientCapture(context.Background())
		var wg sync.WaitGroup
		for range 10 {
			wg.Add(2)
			go func() {
				defer wg.Done()
				capture.record(http.StatusServiceUnavailable, time.Second)
			}()
			go func() {
				defer wg.Done()
				capture.take()
			}()
		}
		wg.Wait()
	})
}

func rejectedTransportError(statusText string) error {
	wireErr := &jsonrpc.Error{Code: -32005, Message: "rejected by transport"}
	return fmt.Errorf("%w: sending \"tools/call\": %v", wireErr, statusText)
}

func TestIsRetryableToolCallError(t *testing.T) {
	tests := map[string]struct {
		err      error
		status   int
		captured bool
		want     bool
	}{
		"nil":                     {nil, 0, false, false},
		"captured429":             {errors.New("anything"), http.StatusTooManyRequests, true, true},
		"captured503":             {errors.New("anything"), http.StatusServiceUnavailable, true, true},
		"unauthorized":            {&UnauthorizedError{URL: "http://x"}, 0, false, false},
		"rejectedTooManyRequests": {rejectedTransportError("Too Many Requests"), 0, false, true},
		"rejectedInternalError":   {rejectedTransportError("Internal Server Error"), 0, false, true},
		"rejectedBadGateway":      {rejectedTransportError("Bad Gateway"), 0, false, true},
		"rejectedUnrelated":       {rejectedTransportError("header failure"), 0, false, false},
		"applicationError":        {fmt.Errorf("calling tool: %w", &jsonrpc.Error{Code: -32603, Message: "Internal error"}), 0, false, false},
		"connectionReset":         {errors.New("read tcp 10.0.0.1:443: connection reset by peer"), 0, false, true},
		"tlsHandshakeTimeout":     {errors.New("net/http: TLS handshake timeout"), 0, false, true},
		"connectionRefused":       {errors.New("dial tcp: connection refused"), 0, false, true},
		"validationError":         {errors.New("invalid tool arguments"), 0, false, false},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			require.Equal(t, tc.want, isRetryableToolCallError(tc.err, tc.status, tc.captured))
		})
	}
}

func TestHeaderTransportRecordsTransientStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "3")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	ht := &headerTransport{base: http.DefaultTransport}
	ctx, capture := withTransientCapture(context.Background())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL, nil)
	require.NoError(t, err)

	resp, err := ht.RoundTrip(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	status, retryAfter, ok := capture.take()
	require.True(t, ok)
	require.Equal(t, http.StatusTooManyRequests, status)
	require.Equal(t, 3*time.Second, retryAfter)
}

func TestHeaderTransportIgnoresTransientWithoutCapture(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	ht := &headerTransport{base: http.DefaultTransport}
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, server.URL, nil)
	require.NoError(t, err)

	resp, err := ht.RoundTrip(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
}
