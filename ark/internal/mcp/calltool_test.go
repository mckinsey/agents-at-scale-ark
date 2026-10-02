package mcp

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/require"
)

type flakyMCPServer struct {
	*httptest.Server
	mu            sync.Mutex
	failuresLeft  int
	failStatus    int
	retryAfter    string
	toolCallCount int
}

func newFlakyMCPServer(t *testing.T, failures, status int, retryAfter string) *flakyMCPServer {
	t.Helper()
	f := &flakyMCPServer{failuresLeft: failures, failStatus: status, retryAfter: retryAfter}

	server := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "flaky-mcp", Version: "v0.1.0"}, nil)
	mcpsdk.AddTool(server, &mcpsdk.Tool{Name: "echo", Description: "echo"},
		func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
			return &mcpsdk.CallToolResult{Content: []mcpsdk.Content{&mcpsdk.TextContent{Text: "ok"}}}, nil, nil
		})
	handler := mcpsdk.NewStreamableHTTPHandler(
		func(*http.Request) *mcpsdk.Server { return server },
		&mcpsdk.StreamableHTTPOptions{Stateless: true, JSONResponse: true},
	)

	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		r.Body = io.NopCloser(bytes.NewReader(body))
		if bytes.Contains(body, []byte(`"tools/call"`)) {
			f.mu.Lock()
			f.toolCallCount++
			fail := f.failuresLeft != 0
			if f.failuresLeft > 0 {
				f.failuresLeft--
			}
			f.mu.Unlock()
			if fail {
				if f.retryAfter != "" {
					w.Header().Set("Retry-After", f.retryAfter)
				}
				w.WriteHeader(f.failStatus)
				return
			}
		}
		handler.ServeHTTP(w, r)
	}))
	t.Cleanup(f.Close)
	return f
}

func (f *flakyMCPServer) toolCalls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.toolCallCount
}

func fastRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts: 3,
		Budget:      5 * time.Second,
		BaseDelay:   time.Millisecond,
		MaxDelay:    5 * time.Millisecond,
	}
}

func newRetryTestClient(t *testing.T, url string, cfg RetryConfig) *MCPClient {
	t.Helper()
	client, err := NewMCPClient(context.Background(), url, nil, httpTransport, 5*time.Second, MCPSettings{}, WithToolCallRetry(cfg))
	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Client.Close() })
	return client
}

func echoParams() *mcpsdk.CallToolParams {
	return &mcpsdk.CallToolParams{Name: "echo", Arguments: map[string]any{}}
}

func TestCallToolRetriesTransientThenSucceeds(t *testing.T) {
	server := newFlakyMCPServer(t, 2, http.StatusTooManyRequests, "")
	client := newRetryTestClient(t, server.URL, fastRetryConfig())

	result, err := client.CallTool(context.Background(), echoParams())
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, 3, server.toolCalls())
}

func TestCallToolExhaustsAttempts(t *testing.T) {
	server := newFlakyMCPServer(t, -1, http.StatusServiceUnavailable, "")
	client := newRetryTestClient(t, server.URL, fastRetryConfig())

	_, err := client.CallTool(context.Background(), echoParams())
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed after 3 attempts")
	require.Equal(t, 3, server.toolCalls())
}

func TestCallToolFailsFastOnNonTransient(t *testing.T) {
	server := newFlakyMCPServer(t, -1, http.StatusBadRequest, "")
	client := newRetryTestClient(t, server.URL, fastRetryConfig())

	_, err := client.CallTool(context.Background(), echoParams())
	require.Error(t, err)
	require.NotContains(t, err.Error(), "failed after")
	require.Equal(t, 1, server.toolCalls())
}

func TestCallToolFailsFastOnConnectionKillingStatus(t *testing.T) {
	server := newFlakyMCPServer(t, -1, http.StatusRequestTimeout, "")
	client := newRetryTestClient(t, server.URL, fastRetryConfig())

	_, err := client.CallTool(context.Background(), echoParams())
	require.Error(t, err)
	require.NotContains(t, err.Error(), "failed after")
	require.Contains(t, err.Error(), "Request Timeout")
	require.Equal(t, 1, server.toolCalls())
}

func TestCallToolSessionSurvivesTransientFailure(t *testing.T) {
	server := newFlakyMCPServer(t, 0, http.StatusTooManyRequests, "")
	client := newRetryTestClient(t, server.URL, fastRetryConfig())

	_, err := client.CallTool(context.Background(), echoParams())
	require.NoError(t, err)

	server.mu.Lock()
	server.failuresLeft = 1
	server.mu.Unlock()

	_, err = client.CallTool(context.Background(), echoParams())
	require.NoError(t, err)

	_, err = client.CallTool(context.Background(), echoParams())
	require.NoError(t, err)
	require.Equal(t, 4, server.toolCalls())
}

func TestCallToolCancelDuringBackoff(t *testing.T) {
	server := newFlakyMCPServer(t, -1, http.StatusServiceUnavailable, "")
	cfg := fastRetryConfig()
	cfg.Budget = time.Minute
	cfg.BaseDelay = 5 * time.Second
	cfg.MaxDelay = 5 * time.Second
	client := newRetryTestClient(t, server.URL, cfg)

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	start := time.Now()
	_, err := client.CallTool(ctx, echoParams())
	require.Error(t, err)
	require.ErrorIs(t, err, context.Canceled)
	require.Less(t, time.Since(start), 2*time.Second)
	require.Equal(t, 1, server.toolCalls())
}

func TestCallToolBudgetExhausted(t *testing.T) {
	server := newFlakyMCPServer(t, -1, http.StatusServiceUnavailable, "")
	cfg := fastRetryConfig()
	cfg.Budget = time.Millisecond
	cfg.BaseDelay = 100 * time.Millisecond
	client := newRetryTestClient(t, server.URL, cfg)

	_, err := client.CallTool(context.Background(), echoParams())
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed after 1 attempts")
	require.Equal(t, 1, server.toolCalls())
}

func newMetricsTestClient(t *testing.T, url, serverName string) *MCPClient {
	t.Helper()
	client, err := NewMCPClient(context.Background(), url, nil, httpTransport, 5*time.Second, MCPSettings{},
		WithToolCallRetry(fastRetryConfig()), WithServerName(serverName))
	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Client.Close() })
	return client
}

func retryMetric(result, server string) float64 {
	return testutil.ToFloat64(toolCallRetries.WithLabelValues(result, server))
}

func TestCallToolRetryMetrics(t *testing.T) {
	t.Run("flakyThenSuccess", func(t *testing.T) {
		server := newFlakyMCPServer(t, 2, http.StatusTooManyRequests, "")
		client := newMetricsTestClient(t, server.URL, "test/flaky-server")

		transientBefore := retryMetric("transient_error", "test/flaky-server")
		successBefore := retryMetric("success", "test/flaky-server")

		_, err := client.CallTool(context.Background(), echoParams())
		require.NoError(t, err)

		require.Equal(t, transientBefore+2, retryMetric("transient_error", "test/flaky-server"))
		require.Equal(t, successBefore+1, retryMetric("success", "test/flaky-server"))
	})

	t.Run("exhaustion", func(t *testing.T) {
		server := newFlakyMCPServer(t, -1, http.StatusServiceUnavailable, "")
		client := newMetricsTestClient(t, server.URL, "test/dead-server")

		transientBefore := retryMetric("transient_error", "test/dead-server")
		exhaustedBefore := retryMetric("exhausted", "test/dead-server")

		_, err := client.CallTool(context.Background(), echoParams())
		require.Error(t, err)

		require.Equal(t, transientBefore+2, retryMetric("transient_error", "test/dead-server"))
		require.Equal(t, exhaustedBefore+1, retryMetric("exhausted", "test/dead-server"))
	})

	t.Run("failFastNotCounted", func(t *testing.T) {
		server := newFlakyMCPServer(t, -1, http.StatusBadRequest, "")
		client := newMetricsTestClient(t, server.URL, "test/broken-server")

		_, err := client.CallTool(context.Background(), echoParams())
		require.Error(t, err)

		for _, result := range []string{"transient_error", "success", "permanent_error", "exhausted"} {
			require.Zero(t, retryMetric(result, "test/broken-server"), "result %s", result)
		}
	})
}

func TestCallToolHonorsRetryAfter(t *testing.T) {
	server := newFlakyMCPServer(t, 1, http.StatusTooManyRequests, "1")
	cfg := fastRetryConfig()
	cfg.MaxDelay = 2 * time.Second
	client := newRetryTestClient(t, server.URL, cfg)

	start := time.Now()
	_, err := client.CallTool(context.Background(), echoParams())
	require.NoError(t, err)
	require.GreaterOrEqual(t, time.Since(start), 900*time.Millisecond)
	require.Equal(t, 2, server.toolCalls())
}

func TestCallToolTimeoutBoundsWholeRetrySequence(t *testing.T) {
	server := newFlakyMCPServer(t, -1, http.StatusTooManyRequests, "")
	cfg := RetryConfig{MaxAttempts: 50, Budget: time.Minute, BaseDelay: 20 * time.Millisecond, MaxDelay: 40 * time.Millisecond}
	client, err := NewMCPClient(context.Background(), server.URL, nil, httpTransport, 5*time.Second, MCPSettings{},
		WithToolCallRetry(cfg), WithToolCallTimeout(200*time.Millisecond))
	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Client.Close() })

	start := time.Now()
	_, err = client.CallTool(context.Background(), echoParams())
	elapsed := time.Since(start)

	require.Error(t, err)
	require.Less(t, elapsed, 30*time.Second, "toolCallTimeout must bound the retry sequence, not just one attempt")
	require.Less(t, server.toolCalls(), cfg.MaxAttempts, "the sequence must stop before exhausting the attempt budget")
}

func TestCallToolWithoutTimeoutRunsFullRetrySequence(t *testing.T) {
	server := newFlakyMCPServer(t, 2, http.StatusTooManyRequests, "")
	client := newRetryTestClient(t, server.URL, fastRetryConfig())

	result, err := client.CallTool(context.Background(), echoParams())

	require.NoError(t, err, "an unset toolCallTimeout must leave retry behaviour untouched")
	require.NotNil(t, result)
	require.Equal(t, 3, server.toolCalls())
}
