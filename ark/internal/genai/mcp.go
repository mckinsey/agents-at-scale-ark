package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"net"
	"net/http"
	"net/url"
	"path"
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
	baseURL string
	headers map[string]string
	client  *mcp.ClientSession
}

func NewMCPClient(ctx context.Context, baseURL string, headers map[string]string, transportType string, timeout time.Duration, mcpSetting MCPSettings) (*MCPClient, error) {
	mergedHeaders := make(map[string]string)
	maps.Copy(mergedHeaders, headers)
	maps.Copy(mergedHeaders, mcpSetting.Headers)

	mcpClient, err := createMCPClientWithRetry(ctx, baseURL, headers, transportType, timeout, 5, 120*time.Second)
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

func createSSEClient() (*mcp.Client, error) {
	// Create HTTP client which is backwards compatible with SSE transport
	return createHTTPClient()
}

func createHTTPClient() (*mcp.Client, error) {
	impl := &mcp.Implementation{
		Name:    arkv1alpha1.GroupVersion.Group,
		Version: arkv1alpha1.GroupVersion.Version,
	}

	mcpClient := mcp.NewClient(impl, nil)
	return mcpClient, nil
}

func createMCPClientByTransport(transportType string) (*mcp.Client, error) {
	switch transportType {
	case "sse":
		return createSSEClient()
	case "http":
		return createHTTPClient()
	default:
		return nil, fmt.Errorf("unsupported transport type: %s", transportType)
	}
}

func performBackoff(ctx context.Context, attempt int, baseURL string) error {
	log := logf.FromContext(ctx)
	backoff := time.Duration(1<<uint(attempt)) * time.Second
	log.Info("retrying MCP client connection", "attempt", attempt+1, "backoff", backoff.String(), "server", baseURL)

	select {
	case <-ctx.Done():
		return fmt.Errorf("context timeout while retrying MCP client creation for %s: %w", baseURL, ctx.Err())
	case <-time.After(backoff):
		return nil
	}
}

func createTransport(baseURL string, headers map[string]string, timeout time.Duration) mcp.Transport {
	// Create HTTP client with headers
	httpClient := &http.Client{
		Timeout: timeout,
	}

	// If we have headers, wrap the transport
	if len(headers) > 0 {
		httpClient.Transport = &headerTransport{
			headers: headers,
			base:    http.DefaultTransport,
		}
	}

	u, _ := url.Parse(baseURL)
	u.Path = path.Join(u.Path, "mcp")
	fullURL := u.String()

	return &mcp.StreamableClientTransport{
		Endpoint:   fullURL,
		HTTPClient: httpClient,
		MaxRetries: 5,
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

func attemptMCPConnection(ctx, connectCtx context.Context, mcpClient *mcp.Client, baseURL string, headers map[string]string, httpTimeout time.Duration) (*mcp.ClientSession, error) {
	log := logf.FromContext(ctx)

	transport := createTransport(baseURL, headers, httpTimeout)
	session, err := mcpClient.Connect(connectCtx, transport, nil)
	if err != nil {
		if isRetryableError(err) {
			log.V(1).Info("retryable error connecting MCP client", "error", err)
			return nil, err
		}
		return nil, fmt.Errorf("failed to connect MCP client for %s: %w", baseURL, err)
	}

	return session, nil
}

func createMCPClientWithRetry(ctx context.Context, baseURL string, headers map[string]string, transportType string, httpTimeout time.Duration, maxRetries int, connectTimeout time.Duration) (*MCPClient, error) {
	log := logf.FromContext(ctx)

	mcpClient, err := createMCPClientByTransport(transportType)
	if err != nil {
		return nil, err
	}

	connectCtx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()

	var lastErr error
	var session *mcp.ClientSession
	for attempt := range maxRetries {
		if attempt > 0 {
			if err := performBackoff(connectCtx, attempt, baseURL); err != nil {
				return nil, err
			}
		}

		session, err = attemptMCPConnection(ctx, connectCtx, mcpClient, baseURL, headers, httpTimeout)
		if err == nil {
			log.Info("MCP client connected successfully", "server", baseURL, "attempts", attempt+1)
			return &MCPClient{
				baseURL: baseURL,
				headers: headers,
				client:  session,
			}, nil
		}

		lastErr = err
		if !isRetryableError(err) {
			return nil, err
		}
	}

	return nil, fmt.Errorf("failed to create MCP client for %s after %d attempts: %w", baseURL, maxRetries, lastErr)
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

func (m *MCPExecutor) Execute(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
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

	log.Info("calling mcp", "tool", m.ToolName, "server", m.MCPClient.baseURL)
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
