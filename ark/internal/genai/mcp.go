package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"net"
	"net/http"
	"strings"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type MCPSettings struct {
	ToolCalls []mcp.CallToolParams `json:"toolCalls,omitempty"`
	Headers   map[string]string    `json:"headers,omitempty"`
}

type MCPClient struct {
	url     string
	headers map[string]string
	client  *mcp.ClientSession
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
			if _, err := mcpClient.client.CallTool(ctx, &setting); err != nil {
				return nil, fmt.Errorf("failed to execute MCP setting tool call %s: %w", setting.Name, err)
			}
		}
	}

	return mcpClient, nil
}

func createHTTPClient() *mcp.Client {
	impl := &mcp.Implementation{
		Name:    arkv1alpha1.GroupVersion.Group,
		Version: arkv1alpha1.GroupVersion.Version,
	}

	mcpClient := mcp.NewClient(impl, nil)
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

func createTransport(url string, headers map[string]string, timeout time.Duration, transportType string) (mcp.Transport, error) {
	// Create HTTP client with headers
	var httpClient *http.Client
	if transportType == sseTransport {
		httpClient = &http.Client{
			// No timeout for SSE: connections are long-lived
		}
	} else {
		httpClient = &http.Client{
			Timeout: timeout,
		}
	}

	// If we have headers, wrap the transport
	if len(headers) > 0 {
		httpClient.Transport = &headerTransport{
			headers: headers,
			base:    http.DefaultTransport,
		}
	}

	switch transportType {
	case sseTransport:
		transport := &mcp.SSEClientTransport{
			Endpoint:   url,
			HTTPClient: httpClient,
		}
		return transport, nil
	case httpTransport:
		transport := &mcp.StreamableClientTransport{
			Endpoint:   url,
			HTTPClient: httpClient,
			MaxRetries: 5,
		}
		return transport, nil
	default:
		return nil, fmt.Errorf("%s: %s", ErrUnsupportedTransport, transportType)
	}
}

type headerTransport struct {
	headers map[string]string
	base    http.RoundTripper
}

func (t *headerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.Header.Set("Accept", "application/json, text/event-stream")

	for k, v := range t.headers {
		req.Header.Set(k, v)
	}

	return t.base.RoundTrip(req)
}

func attemptMCPConnection(ctx context.Context, mcpClient *mcp.Client, url string, headers map[string]string, httpTimeout time.Duration, transportType string) (*mcp.ClientSession, error) {
	log := logf.FromContext(ctx)

	transport, err := createTransport(url, headers, httpTimeout, transportType)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP client transport for %s: %w", url, err)
	}

	// For SSE, the context passed here controls the connection lifetime
	// It should be the caller's context, not a temporary one
	session, err := mcpClient.Connect(ctx, transport, nil)
	if err != nil {
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

	// Create a context with timeout ONLY for the retry loop
	// The caller's context (ctx) is used for the actual connection and should control its lifetime
	retryCtx, retryCancel := context.WithTimeout(context.Background(), httpTimeout)
	defer retryCancel()

	var lastErr error

	for attempt := range maxRetries {
		if attempt > 0 {
			if err := performBackoff(retryCtx, attempt, url); err != nil {
				return nil, err
			}
		}

		// Use the caller's context for the connection
		// For SSE: This context controls the connection lifetime - when ctx is canceled, connection closes
		// For HTTP: This context is used per-request
		session, err := attemptMCPConnection(ctx, mcpClient, url, headers, httpTimeout, transportType)
		if err == nil {
			return &MCPClient{
				url:     url,
				headers: headers,
				client:  session,
			}, nil
		}

		lastErr = err
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

	// Check for connection refused errors
	if netErr, ok := err.(*net.OpError); ok && netErr.Op == "dial" {
		if syscallErr, ok := netErr.Err.(*net.DNSError); ok && syscallErr.IsTemporary {
			return true
		}
		if syscallErr, ok := netErr.Err.(syscall.Errno); ok && syscallErr == syscall.ECONNREFUSED {
			return true
		}
	}

	// Check error string for common retryable patterns
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

func (c *MCPClient) ListTools(ctx context.Context) ([]*mcp.Tool, error) {
	response, err := c.client.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		return nil, err
	}

	return response.Tools, nil
}

// MCP Tool Executor
type MCPExecutor struct {
	MCPClient *MCPClient
	ToolName  string
}

func (m *MCPExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	log := logf.FromContext(ctx)

	if m.MCPClient == nil {
		err := fmt.Errorf("MCP client not initialized for tool %s", m.ToolName)
		log.Error(err, "MCP client is nil")
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}

	if m.MCPClient.client == nil {
		err := fmt.Errorf("MCP client connection not initialized for tool %s", m.ToolName)
		log.Error(err, "MCP client connection is nil")
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}

	var arguments map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		log.Info("Error parsing tool arguments", "ToolCall", call)
		arguments = make(map[string]any)
	}

	response, err := m.MCPClient.client.CallTool(ctx, &mcp.CallToolParams{
		Name:      m.ToolName,
		Arguments: arguments,
	})
	if err != nil {
		log.Info("tool call error", "tool", m.ToolName, "error", err, "errorType", fmt.Sprintf("%T", err))
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}
	log.V(2).Info("tool call response", "tool", m.ToolName, "response", response)
	var result strings.Builder
	for _, content := range response.Content {
		if textContent, ok := content.(*mcp.TextContent); ok {
			result.WriteString(textContent.Text)
		} else {
			jsonBytes, _ := json.MarshalIndent(content, "", "  ")
			result.WriteString(string(jsonBytes))
		}
	}
	return ToolResult{ID: call.ID, Name: call.Function.Name, Content: result.String()}, nil
}

// BuildMCPServerURL builds the URL for an MCP server with full ValueSource resolution
func BuildMCPServerURL(ctx context.Context, k8sClient client.Client, mcpServerCRD *arkv1alpha1.MCPServer) (string, error) {
	address := mcpServerCRD.Spec.Address

	// Handle direct value
	if address.Value != "" {
		return address.Value, nil
	}

	// Handle service reference
	if address.ValueFrom != nil && address.ValueFrom.ServiceRef != nil {
		// Create a service reference with the MCP endpoint path
		serviceRef := &arkv1alpha1.ServiceReference{
			Name:      address.ValueFrom.ServiceRef.Name,
			Namespace: address.ValueFrom.ServiceRef.Namespace,
			Port:      address.ValueFrom.ServiceRef.Port,
			Path:      address.ValueFrom.ServiceRef.Path, // Override path with MCP endpoint
		}

		return common.ResolveServiceReference(ctx, k8sClient, serviceRef, mcpServerCRD.Namespace)
	}

	// Handle other ValueSource types (secrets, configmaps) using the ValueSourceResolver
	resolver := common.NewValueSourceResolver(k8sClient)
	return resolver.ResolveValueSource(ctx, address, mcpServerCRD.Namespace)
}
