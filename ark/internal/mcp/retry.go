package mcp

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

const jsonrpcCodeRejectedByTransport = -32005

type RetryConfig struct {
	MaxAttempts int
	Budget      time.Duration
	BaseDelay   time.Duration
	MaxDelay    time.Duration
}

func defaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts: 3,
		Budget:      30 * time.Second,
		BaseDelay:   500 * time.Millisecond,
		MaxDelay:    4 * time.Second,
	}
}

func (cfg RetryConfig) withDefaults() RetryConfig {
	def := defaultRetryConfig()
	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = def.MaxAttempts
	}
	if cfg.Budget <= 0 {
		cfg.Budget = def.Budget
	}
	if cfg.BaseDelay <= 0 {
		cfg.BaseDelay = def.BaseDelay
	}
	if cfg.MaxDelay <= 0 {
		cfg.MaxDelay = def.MaxDelay
	}
	return cfg
}

func (c *MCPClient) serverLabel() string {
	if c.serverName != "" {
		return c.serverName
	}
	if parsed, err := url.Parse(c.URL); err == nil {
		return parsed.Host
	}
	return ""
}

func recordRetryOutcome(result, server string, attempts int) {
	if attempts > 1 {
		toolCallRetries.WithLabelValues(result, server).Inc()
	}
}

func waitForRetry(ctx context.Context, delay time.Duration, budgetEnd time.Time) (bool, error) {
	wakeAt := time.Now().Add(delay)
	if wakeAt.After(budgetEnd) {
		return false, nil
	}
	if ctxDeadline, ok := ctx.Deadline(); ok && wakeAt.After(ctxDeadline) {
		return false, nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	case <-timer.C:
		return true, nil
	}
}

func (c *MCPClient) CallTool(ctx context.Context, params *mcpsdk.CallToolParams) (*mcpsdk.CallToolResult, error) {
	if c.Client == nil {
		return nil, errors.New("MCP client session not initialized")
	}

	log := logf.FromContext(ctx)
	cfg := c.retry.withDefaults()
	label := c.serverLabel()
	ctx, capture := withTransientCapture(ctx)
	budgetEnd := time.Now().Add(cfg.Budget)

	var lastErr error
	var retryAfter time.Duration
	attempts := 0

	for attempts < cfg.MaxAttempts {
		if attempts > 0 {
			proceed, err := waitForRetry(ctx, toolCallBackoff(attempts-1, cfg, retryAfter), budgetEnd)
			if err != nil {
				return nil, fmt.Errorf("tool call %s aborted during retry backoff: %w", params.Name, err)
			}
			if !proceed {
				break
			}
		}

		attempts++
		result, err := c.Client.CallTool(ctx, params)
		if err == nil {
			recordRetryOutcome("success", label, attempts)
			return result, nil
		}

		status, nextRetryAfter, captured := capture.take()
		if !isRetryableToolCallError(err, status, captured) {
			recordRetryOutcome("permanent_error", label, attempts)
			return nil, err
		}
		recordRetryOutcome("transient_error", label, attempts)
		lastErr = err
		retryAfter = nextRetryAfter
		log.V(1).Info("retrying MCP tool call after transient error", "tool", params.Name, "attempt", attempts, "status", status, "error", err.Error())
	}

	return nil, fmt.Errorf("tool call %s failed after %d attempts: %w", params.Name, attempts, lastErr)
}

type transientCaptureKey struct{}

// transientCapture carries HTTP status and Retry-After out of the transport
// layer via the request context, because the MCP SDK strips both from the
// error it returns on transient responses.
type transientCapture struct {
	mu         sync.Mutex
	status     int
	retryAfter time.Duration
	set        bool
}

func withTransientCapture(ctx context.Context) (context.Context, *transientCapture) {
	capture := &transientCapture{}
	return context.WithValue(ctx, transientCaptureKey{}, capture), capture
}

func transientCaptureFrom(ctx context.Context) *transientCapture {
	capture, _ := ctx.Value(transientCaptureKey{}).(*transientCapture)
	return capture
}

func (c *transientCapture) record(status int, retryAfter time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.status = status
	c.retryAfter = retryAfter
	c.set = true
}

func (c *transientCapture) take() (int, time.Duration, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	status, retryAfter, set := c.status, c.retryAfter, c.set
	c.status, c.retryAfter, c.set = 0, 0, false
	return status, retryAfter, set
}

func isTransientHTTPStatus(status int) bool {
	switch status {
	case http.StatusRequestTimeout, http.StatusTooEarly, http.StatusTooManyRequests:
		return true
	}
	return status >= 500
}

func parseRetryAfter(header string) (time.Duration, bool) {
	if header == "" {
		return 0, false
	}
	if seconds, err := strconv.Atoi(header); err == nil {
		if seconds < 0 {
			return 0, false
		}
		return time.Duration(seconds) * time.Second, true
	}
	if date, err := http.ParseTime(header); err == nil {
		if delay := time.Until(date); delay > 0 {
			return delay, true
		}
	}
	return 0, false
}

func toolCallBackoff(attempt int, cfg RetryConfig, retryAfter time.Duration) time.Duration {
	delay := cfg.BaseDelay << uint(attempt)
	if delay <= 0 || delay > cfg.MaxDelay {
		delay = cfg.MaxDelay
	}
	jitterRange := delay / 2
	if jitterRange > 0 {
		delay += rand.N(jitterRange) - jitterRange/2
	}
	if floor := min(retryAfter, cfg.MaxDelay); floor > delay {
		delay = floor
	}
	return delay
}

var transientStatusTexts = []string{
	"Too Many Requests",
	"Internal Server Error",
	"Bad Gateway",
	"Service Unavailable",
	"Gateway Timeout",
}

func isRetryableToolCallError(err error, status int, captured bool) bool {
	if err == nil {
		return false
	}
	if captured {
		return isTransientHTTPStatus(status)
	}
	if _, ok := IsUnauthorizedError(err); ok {
		return false
	}
	if isRetryableError(err) {
		return true
	}
	errStr := strings.ToLower(err.Error())
	for _, pattern := range []string{"connection reset", "tls handshake timeout", "unexpected eof"} {
		if strings.Contains(errStr, pattern) {
			return true
		}
	}
	var wireErr *jsonrpc.Error
	if errors.As(err, &wireErr) && wireErr.Code == jsonrpcCodeRejectedByTransport {
		for _, text := range transientStatusTexts {
			if strings.Contains(err.Error(), text) {
				return true
			}
		}
	}
	return false
}
