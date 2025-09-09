package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"syscall"
	"time"

	mcpclient "github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type MCPClient struct {
	baseURL string
	headers map[string]string
	client  *mcpclient.Client
}

func NewMCPClient(ctx context.Context, baseURL string, headers map[string]string, transportType string) (*MCPClient, error) {
	return createMCPClientWithRetry(ctx, baseURL, headers, transportType, 5, 120*time.Second)
}

func createSSEClient(baseURL string, headers map[string]string) (*mcpclient.Client, error) {
	var opts []transport.ClientOption
	if len(headers) > 0 {
		opts = append(opts, transport.WithHeaders(headers))
	}
	mcpClient, err := mcpclient.NewSSEMCPClient(baseURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create SSE MCP client for %s: %w", baseURL, err)
	}
	return mcpClient, nil
}

func createHTTPClient(baseURL string, headers map[string]string) (*mcpclient.Client, error) {
	var opts []transport.StreamableHTTPCOption

	if len(headers) > 0 {
		opts = append(opts, transport.WithHTTPHeaders(headers))
	}

	mcpClient, err := mcpclient.NewStreamableHttpClient(baseURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create MCP client for %s: %w", baseURL, err)
	}
	return mcpClient, nil
}

func createMCPClientByTransport(baseURL string, headers map[string]string, transportType string) (*mcpclient.Client, error) {
	switch transportType {
	case "sse":
		return createSSEClient(baseURL, headers)
	case "http":
		return createHTTPClient(baseURL, headers)
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

func attemptMCPConnection(ctx, connectCtx context.Context, mcpClient *mcpclient.Client, baseURL string) error {
	log := logf.FromContext(ctx)
	if err := mcpClient.Start(ctx); err != nil {
		if isRetryableError(err) {
			log.V(1).Info("retryable error starting MCP transport", "error", err)
			return err
		}
		return fmt.Errorf("failed to start MCP transport for %s: %w", baseURL, err)
	}

	_, err := mcpClient.Initialize(connectCtx, mcp.InitializeRequest{})
	if err != nil {
		if isRetryableError(err) {
			log.V(1).Info("retryable error initializing MCP client", "error", err)
			return err
		}
		return fmt.Errorf("failed to initialize MCP client for %s: transport error: %w", baseURL, err)
	}

	return nil
}

func createMCPClientWithRetry(ctx context.Context, baseURL string, headers map[string]string, transportType string, maxRetries int, timeout time.Duration) (*MCPClient, error) {
	log := logf.FromContext(ctx)

	mcpClient, err := createMCPClientByTransport(baseURL, headers, transportType)
	if err != nil {
		return nil, err
	}

	connectCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var lastErr error
	for attempt := range maxRetries {
		if attempt > 0 {
			if err := performBackoff(connectCtx, attempt, baseURL); err != nil {
				return nil, err
			}
		}

		err := attemptMCPConnection(ctx, connectCtx, mcpClient, baseURL)
		if err == nil {
			log.Info("MCP client connected successfully", "server", baseURL, "attempts", attempt+1)
			return &MCPClient{
				baseURL: baseURL,
				headers: headers,
				client:  mcpClient,
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

func (c *MCPClient) ListTools(ctx context.Context) ([]mcp.Tool, error) {
	response, err := c.client.ListTools(ctx, mcp.ListToolsRequest{})
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
	response, err := m.MCPClient.client.CallTool(ctx, mcp.CallToolRequest{Params: mcp.CallToolParams{
		Name:      m.ToolName,
		Arguments: arguments,
	}})
	if err != nil {
		log.Info("tool call error", "tool", m.ToolName, "error", err, "errorType", fmt.Sprintf("%T", err))
		return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, err
	}
	log.V(2).Info("tool call response", "tool", m.ToolName, "response", response)
	var result strings.Builder
	for _, content := range response.Content {
		if textContent, ok := content.(mcp.TextContent); ok {
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

// ResolveHeaderValue resolves header values from secrets (v1alpha1)
func ResolveHeaderValue(ctx context.Context, k8sClient client.Client, header arkv1alpha1.Header, namespace string) (string, error) {
	if header.Value.Value != "" {
		return header.Value.Value, nil
	}

	if header.Value.ValueFrom != nil && header.Value.ValueFrom.SecretKeyRef != nil {
		secretRef := header.Value.ValueFrom.SecretKeyRef
		secret := &corev1.Secret{}

		secretKey := types.NamespacedName{
			Name:      secretRef.Name,
			Namespace: namespace,
		}

		if err := k8sClient.Get(ctx, secretKey, secret); err != nil {
			return "", fmt.Errorf("failed to get secret %s/%s: %w", namespace, secretRef.Name, err)
		}

		value, exists := secret.Data[secretRef.Key]
		if !exists {
			return "", fmt.Errorf("key %s not found in secret %s/%s", secretRef.Key, namespace, secretRef.Name)
		}

		return string(value), nil
	}

	return "", fmt.Errorf("header value must specify either value or valueFrom.secretKeyRef")
}

// ResolveHeaderValueV1PreAlpha1 resolves header values from secrets (v1prealpha1)
// Since v1prealpha1.Header uses arkv1alpha1.HeaderValue, we can reuse the existing function
func ResolveHeaderValueV1PreAlpha1(ctx context.Context, k8sClient client.Client, header arkv1prealpha1.Header, namespace string) (string, error) {
	// Convert to v1alpha1.Header since the Value field is the same type
	v1alpha1Header := arkv1alpha1.Header{
		Name:  header.Name,
		Value: header.Value, // Same type: arkv1alpha1.HeaderValue
	}
	return ResolveHeaderValue(ctx, k8sClient, v1alpha1Header, namespace)
}
