package mcp

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"net"
	"net/http"
	"strings"
	"sync"
	"syscall"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type MCPSettings struct {
	ToolCalls []mcpsdk.CallToolParams `json:"toolCalls,omitempty"`
	Headers   map[string]string       `json:"headers,omitempty"`
}

type MCPClient struct {
	URL     string
	Headers map[string]string
	Client  *mcpsdk.ClientSession
}

const (
	connectMaxReties = 5

	sseTransport  = "sse"
	httpTransport = "http"
)

var (
	ErrConnectionRetryFailed = "context timeout while retrying MCP client creation for server"
	ErrUnsupportedTransport  = "unsupported transport type"
)

// UnauthorizedError indicates the MCP server responded with HTTP 401. It
// carries the WWW-Authenticate header so callers can perform RFC 9728
// authorization discovery.
type UnauthorizedError struct {
	URL             string
	WWWAuthenticate string
}

func (e *UnauthorizedError) Error() string {
	return fmt.Sprintf("MCP server %s returned 401 Unauthorized", e.URL)
}

// IsUnauthorizedError reports whether err (or any error it wraps) is an
// UnauthorizedError, and returns the typed error.
func IsUnauthorizedError(err error) (*UnauthorizedError, bool) {
	var ue *UnauthorizedError
	if err == nil {
		return nil, false
	}
	if errors.As(err, &ue) {
		return ue, true
	}
	return nil, false
}

func NewMCPClient(ctx context.Context, url string, headers map[string]string, transportType string, timeout time.Duration, mcpSetting MCPSettings) (*MCPClient, error) {
	mergedHeaders := make(map[string]string)
	maps.Copy(mergedHeaders, headers)
	maps.Copy(mergedHeaders, mcpSetting.Headers)

	mcpClient, err := createMCPClientWithRetry(ctx, url, mergedHeaders, transportType, timeout, connectMaxReties)
	if err != nil {
		return nil, err
	}

	if len(mcpSetting.ToolCalls) > 0 {
		for _, setting := range mcpSetting.ToolCalls {
			if _, err := mcpClient.Client.CallTool(ctx, &setting); err != nil {
				return nil, fmt.Errorf("failed to execute MCP setting tool call %s: %w", setting.Name, err)
			}
		}
	}

	return mcpClient, nil
}

func createHTTPClient() *mcpsdk.Client {
	impl := &mcpsdk.Implementation{
		Name:    arkv1alpha1.GroupVersion.Group,
		Version: arkv1alpha1.GroupVersion.Version,
	}

	mcpClient := mcpsdk.NewClient(impl, nil)
	return mcpClient
}

func performBackoff(ctx context.Context, attempt int, url string) error {
	log := logf.FromContext(ctx)
	backoff := time.Duration(1<<uint(attempt)) * time.Second
	log.V(1).Info("retrying MCP client connection", "attempt", attempt+1, "backoff", backoff.String(), "server", url)

	select {
	case <-ctx.Done():
		return fmt.Errorf("%s %s: %w", ErrConnectionRetryFailed, url, ctx.Err())
	case <-time.After(backoff):
		return nil
	}
}

func createTransport(url string, headers map[string]string, transportType string) (mcpsdk.Transport, *headerTransport, error) {
	httpClient := &http.Client{}

	// Always install a headerTransport so 401 responses can be captured,
	// even when no authorization headers are configured on the MCPServer.
	ht := &headerTransport{
		headers: headers,
		base:    http.DefaultTransport,
	}
	httpClient.Transport = ht

	switch transportType {
	case sseTransport:
		transport := &mcpsdk.SSEClientTransport{
			Endpoint:   url,
			HTTPClient: httpClient,
		}
		return transport, ht, nil
	case httpTransport:
		transport := &mcpsdk.StreamableClientTransport{
			Endpoint:   url,
			HTTPClient: httpClient,
			MaxRetries: 5,
		}
		return transport, ht, nil
	default:
		return nil, nil, fmt.Errorf("%s: %s", ErrUnsupportedTransport, transportType)
	}
}

type headerTransport struct {
	headers map[string]string
	base    http.RoundTripper

	// mu guards lastUnauthorized. The MCP SDK strips HTTP details from the
	// error it returns on a 401, so we capture them here to let callers
	// perform RFC 9728 authorization discovery without string-matching.
	mu               sync.Mutex
	lastUnauthorized *UnauthorizedError
}

func (t *headerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("Accept", "application/json, text/event-stream")

	for k, v := range t.headers {
		req.Header.Set(k, v)
	}

	resp, err := t.base.RoundTrip(req)
	if err == nil && resp != nil && resp.StatusCode == http.StatusUnauthorized {
		t.mu.Lock()
		t.lastUnauthorized = &UnauthorizedError{
			URL:             req.URL.String(),
			WWWAuthenticate: resp.Header.Get("WWW-Authenticate"),
		}
		t.mu.Unlock()
	}
	return resp, err
}

func (t *headerTransport) takeUnauthorized() *UnauthorizedError {
	t.mu.Lock()
	defer t.mu.Unlock()
	ue := t.lastUnauthorized
	t.lastUnauthorized = nil
	return ue
}

func attemptMCPConnection(ctx context.Context, mcpClient *mcpsdk.Client, url string, headers map[string]string, transportType string) (*mcpsdk.ClientSession, error) {
	log := logf.FromContext(ctx)

	transport, ht, err := createTransport(url, headers, transportType)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP client transport for %s: %w", url, err)
	}

	session, err := mcpClient.Connect(ctx, transport, nil)
	if err != nil {
		if ue := ht.takeUnauthorized(); ue != nil {
			return nil, ue
		}
		if isRetryableError(err) {
			log.V(1).Info("retryable error connecting MCP client", "error", err)
			return nil, err
		}
		return nil, fmt.Errorf("failed to connect MCP client for %s: %w", url, err)
	}

	return session, nil
}

func createMCPClientWithRetry(ctx context.Context, url string, headers map[string]string, transportType string, httpTimeout time.Duration, maxRetries int) (*MCPClient, error) {
	mcpClient := createHTTPClient()

	retryCtx, retryCancel := context.WithTimeout(context.Background(), httpTimeout)
	defer retryCancel()

	var lastErr error

	for attempt := range maxRetries {
		if attempt > 0 {
			if err := performBackoff(retryCtx, attempt, url); err != nil {
				return nil, err
			}
		}

		session, err := attemptMCPConnection(ctx, mcpClient, url, headers, transportType)
		if err == nil {
			return &MCPClient{
				URL:     url,
				Headers: headers,
				Client:  session,
			}, nil
		}

		lastErr = err
		if _, ok := IsUnauthorizedError(err); ok {
			return nil, err
		}
		if !isRetryableError(err) {
			return nil, err
		}
	}

	return nil, fmt.Errorf("failed to create MCP client for %s after %d attempts: %w", url, maxRetries, lastErr)
}

func isRetryableError(err error) bool {
	if err == nil {
		return false
	}

	if netErr, ok := err.(*net.OpError); ok && netErr.Op == "dial" {
		if syscallErr, ok := netErr.Err.(*net.DNSError); ok && syscallErr.IsTemporary {
			return true
		}
		if syscallErr, ok := netErr.Err.(syscall.Errno); ok && syscallErr == syscall.ECONNREFUSED {
			return true
		}
	}

	errStr := strings.ToLower(err.Error())
	retryablePatterns := []string{
		"connection refused",
		"no such host",
		"network is unreachable",
		"timeout",
		"temporary failure",
	}

	for _, pattern := range retryablePatterns {
		if strings.Contains(errStr, pattern) {
			return true
		}
	}

	return false
}

func (c *MCPClient) ListTools(ctx context.Context) ([]*mcpsdk.Tool, error) {
	response, err := c.Client.ListTools(ctx, &mcpsdk.ListToolsParams{})
	if err != nil {
		return nil, err
	}

	return response.Tools, nil
}

func BuildMCPServerURL(ctx context.Context, k8sClient client.Client, mcpServerCRD *arkv1alpha1.MCPServer) (string, error) {
	address := mcpServerCRD.Spec.Address

	if address.Value != "" {
		return address.Value, nil
	}

	if address.ValueFrom != nil && address.ValueFrom.ServiceRef != nil {
		serviceRef := &arkv1alpha1.ServiceReference{
			Name:      address.ValueFrom.ServiceRef.Name,
			Namespace: address.ValueFrom.ServiceRef.Namespace,
			Port:      address.ValueFrom.ServiceRef.Port,
			Path:      address.ValueFrom.ServiceRef.Path,
		}

		return common.ResolveServiceReference(ctx, k8sClient, serviceRef, mcpServerCRD.Namespace)
	}

	resolver := common.NewValueSourceResolver(k8sClient)
	return resolver.ResolveValueSource(ctx, address, mcpServerCRD.Namespace)
}
