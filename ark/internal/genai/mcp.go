package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type MCPSettings struct {
	ToolCalls []mcp.CallToolParams `json:"toolCalls,omitempty"`
}

type MCPClient struct {
	baseURL string
	headers map[string]string
	client  *mcp.ClientSession
}

func NewMCPClient(ctx context.Context, baseURL string, headers map[string]string, transportType string, timeout time.Duration, mcpSetting MCPSettings) (*MCPClient, error) {
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

// ResolveHeaderValue resolves header values from secrets or configmaps (v1alpha1)
func ResolveHeaderValue(ctx context.Context, k8sClient client.Client, header arkv1alpha1.Header, namespace string) (string, error) {
	if header.Value.Value != "" {
		return header.Value.Value, nil
	}

	if header.Value.ValueFrom == nil {
		return "", fmt.Errorf("header value must specify either value or valueFrom.secretKeyRef or valueFrom.configMapKeyRef")
	}

	if header.Value.ValueFrom.SecretKeyRef != nil {
		return resolveHeaderFromSecret(ctx, k8sClient, header.Value.ValueFrom.SecretKeyRef, namespace)
	}

	if header.Value.ValueFrom.ConfigMapKeyRef != nil {
		return resolveHeaderFromConfigMap(ctx, k8sClient, header.Value.ValueFrom.ConfigMapKeyRef, namespace)
	}

	return "", fmt.Errorf("header value must specify either value or valueFrom.secretKeyRef or valueFrom.configMapKeyRef")
}

func resolveHeaderFromSecret(ctx context.Context, k8sClient client.Client, secretRef *corev1.SecretKeySelector, namespace string) (string, error) {
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

func resolveHeaderFromConfigMap(ctx context.Context, k8sClient client.Client, configMapRef *corev1.ConfigMapKeySelector, namespace string) (string, error) {
	configMap := &corev1.ConfigMap{}
	configMapKey := types.NamespacedName{
		Name:      configMapRef.Name,
		Namespace: namespace,
	}

	if err := k8sClient.Get(ctx, configMapKey, configMap); err != nil {
		return "", fmt.Errorf("failed to get configMap %s/%s: %w", namespace, configMapRef.Name, err)
	}

	value, exists := configMap.Data[configMapRef.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in configMap %s/%s", configMapRef.Key, namespace, configMapRef.Name)
	}

	return value, nil
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
