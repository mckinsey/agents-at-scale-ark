package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/shared"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type ToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// HTTPExecutor executes HTTP tools
type HTTPExecutor struct {
	K8sClient     client.Client
	ToolName      string
	ToolNamespace string
}

// Execute implements ToolExecutor interface for HTTP tools
func (h *HTTPExecutor) Execute(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
	// Parse arguments
	var arguments map[string]any
	if call.Function.Arguments != "" {
		if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
			return ToolResult{
				ID:    call.ID,
				Name:  call.Function.Name,
				Error: fmt.Sprintf("failed to parse arguments: %v", err),
			}, fmt.Errorf("failed to parse arguments: %w", err)
		}
	}

	// Get tool from Kubernetes
	tool := &arkv1alpha1.Tool{}
	objectKey := client.ObjectKey{Name: h.ToolName}
	if h.ToolNamespace != "" {
		objectKey.Namespace = h.ToolNamespace
	}
	if err := h.K8sClient.Get(ctx, objectKey, tool); err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to get tool %s: %v", h.ToolName, err),
		}, fmt.Errorf("failed to get tool %s: %w", h.ToolName, err)
	}

	log := logf.FromContext(ctx).WithValues("tool", tool.Name, "toolID", call.ID)

	httpSpec := tool.Spec.HTTP
	if httpSpec == nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "HTTP spec is required",
		}, fmt.Errorf("HTTP spec is required")
	}

	// Substitute URL parameters
	finalURL := h.substituteURLParameters(httpSpec.URL, arguments)

	// Parse URL
	parsedURL, err := url.Parse(finalURL)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("invalid URL: %v", err),
		}, fmt.Errorf("invalid URL: %w", err)
	}

	// Determine HTTP method
	method := httpSpec.Method
	if method == "" {
		method = "GET"
	}

	// Handle request body for POST/PUT/PATCH requests
	var requestBody io.Reader
	if httpSpec.Body != "" && (method == "POST" || method == "PUT" || method == "PATCH") {
		bodyContent, err := ResolveBodyTemplate(ctx, h.K8sClient, tool.Namespace, httpSpec.Body, httpSpec.BodyParameters, arguments)
		if err != nil {
			log.Error(err, "failed to resolve body template", "template", httpSpec.Body)
			return ToolResult{
				ID:    call.ID,
				Name:  call.Function.Name,
				Error: fmt.Sprintf("failed to resolve body template: %v", err),
			}, fmt.Errorf("failed to resolve body template: %w", err)
		}
		requestBody = strings.NewReader(bodyContent)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, method, parsedURL.String(), requestBody)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to create request: %v", err),
		}, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers
	for _, header := range httpSpec.Headers {
		value, err := h.resolveHeaderValue(ctx, header.Value, tool.Namespace)
		if err != nil {
			return ToolResult{
				ID:    call.ID,
				Name:  call.Function.Name,
				Error: fmt.Sprintf("failed to resolve header %s: %v", header.Name, err),
			}, fmt.Errorf("failed to resolve header %s: %w", header.Name, err)
		}
		req.Header.Set(header.Name, value)
	}

	// Set timeout
	timeout := h.getTimeout(httpSpec.Timeout)
	httpClient := &http.Client{Timeout: timeout}

	// Make the request
	log.Info("making HTTP request", "method", method, "url", parsedURL.String())
	resp, err := httpClient.Do(req)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to fetch URL: %v", err),
		}, fmt.Errorf("failed to fetch URL: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	// Check for HTTP errors
	if resp.StatusCode >= 400 {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("HTTP error %d: %s (URL: %s)", resp.StatusCode, resp.Status, parsedURL.String()),
		}, fmt.Errorf("HTTP error %d: %s", resp.StatusCode, resp.Status)
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to read response: %v", err),
		}, fmt.Errorf("failed to read response: %w", err)
	}

	log.Info("HTTP request completed", "status", resp.StatusCode, "responseSize", len(body))

	return ToolResult{
		ID:      call.ID,
		Name:    call.Function.Name,
		Content: string(body),
	}, nil
}

type ToolRegistry struct {
	tools     map[string]ToolDefinition
	executors map[string]ToolExecutor
	mcpPool   *MCPClientPool // One MCP client pool per agent
}

func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		tools:     make(map[string]ToolDefinition),
		executors: make(map[string]ToolExecutor),
		mcpPool:   NewMCPClientPool(),
	}
}

func (tr *ToolRegistry) RegisterTool(def ToolDefinition, executor ToolExecutor) {
	tr.tools[def.Name] = def
	tr.executors[def.Name] = executor
}

func (tr *ToolRegistry) GetToolDefinitions() []ToolDefinition {
	definitions := make([]ToolDefinition, 0, len(tr.tools))
	for _, def := range tr.tools {
		definitions = append(definitions, def)
	}
	return definitions
}

func (tr *ToolRegistry) GetToolType(toolName string) string {
	executor, exists := tr.executors[toolName]
	if !exists {
		return "unknown"
	}

	switch executor.(type) {
	case *NoopExecutor:
		return "builtin"
	case *TerminateExecutor:
		return "builtin"
	case *HTTPExecutor:
		return "custom"
	case *MCPExecutor:
		return "mcp"
	case *FilteredToolExecutor:
		return "filtered"
	default:
		return "unknown"
	}
}

func (tr *ToolRegistry) ExecuteTool(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
	executor, exists := tr.executors[call.Function.Name]
	if !exists {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("tool %s not found", call.Function.Name),
		}, fmt.Errorf("tool %s not found", call.Function.Name)
	}

	return executor.Execute(ctx, call, recorder)
}

func (tr *ToolRegistry) ToOpenAITools() []openai.ChatCompletionToolParam {
	tools := make([]openai.ChatCompletionToolParam, 0, len(tr.tools))

	for _, def := range tr.tools {
		tool := openai.ChatCompletionToolParam{
			Type: "function",
			Function: shared.FunctionDefinitionParam{
				Name:        def.Name,
				Description: openai.String(def.Description),
				Parameters:  shared.FunctionParameters(def.Parameters),
			},
		}
		tools = append(tools, tool)
	}

	return tools
}

// GetMCPPool returns the MCP client pool for this tool registry
func (tr *ToolRegistry) GetMCPPool() *MCPClientPool {
	return tr.mcpPool
}

// Close closes all MCP client connections in the tool registry
func (tr *ToolRegistry) Close() error {
	if tr.mcpPool != nil {
		return tr.mcpPool.Close()
	}
	return nil
}

type NoopExecutor struct{}

func (n *NoopExecutor) Execute(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
	var arguments map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		logf.Log.Info("Error parsing tool arguments", "ToolCall", call)
		arguments = make(map[string]any)
	}
	return ToolResult{
		ID:      call.ID,
		Name:    call.Function.Name,
		Content: fmt.Sprintf("%v", arguments),
	}, nil
}

func GetNoopTool() ToolDefinition {
	return ToolDefinition{
		Name:        "noop",
		Description: "A no-operation tool that does nothing and returns success",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"message": map[string]any{
					"type":        "string",
					"description": "Optional message to include in the response",
				},
			},
		},
	}
}

type TerminateExecutor struct{}

func (t *TerminateExecutor) Execute(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
	var arguments map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		logf.Log.Info("Error parsing tool arguments", "ToolCall", call)
		arguments = make(map[string]any)
	}
	if responseArg, exists := arguments["response"]; exists {
		if responseStr, ok := responseArg.(string); ok {
			return ToolResult{ID: call.ID, Name: call.Function.Name, Content: responseStr}, &TerminateTeam{}
		}
	}
	return ToolResult{ID: call.ID, Name: call.Function.Name, Content: ""}, fmt.Errorf("no response")
}

func GetTerminateTool() ToolDefinition {
	return ToolDefinition{
		Name:        "terminate",
		Description: "Use this function to provide a final response to the user and then end the current conversation",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"response": map[string]any{
					"type":        "string",
					"description": "The message to send before ending the conversation",
				},
			},
			"required": []string{"response"},
		},
	}
}

func (h *HTTPExecutor) getTimeout(timeoutStr string) time.Duration {
	if timeoutStr == "" {
		return 30 * time.Second
	}

	timeout, err := time.ParseDuration(timeoutStr)
	if err != nil {
		return 30 * time.Second
	}

	return timeout
}

func (h *HTTPExecutor) substituteURLParameters(urlTemplate string, arguments map[string]any) string {
	if arguments == nil {
		return urlTemplate
	}

	paramRegex := regexp.MustCompile(`\{([^}]+)\}`)
	result := urlTemplate

	matches := paramRegex.FindAllStringSubmatch(urlTemplate, -1)
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}

		placeholder := match[0]
		paramName := match[1]

		if value, exists := arguments[paramName]; exists {
			stringValue := fmt.Sprintf("%v", value)
			encodedValue := url.QueryEscape(stringValue)
			result = strings.ReplaceAll(result, placeholder, encodedValue)
		}
	}

	return result
}

func CreateToolFromCRD(toolCRD *arkv1alpha1.Tool) ToolDefinition {
	description := toolCRD.Spec.Description
	if description == "" && toolCRD.Annotations != nil {
		if desc, exists := toolCRD.Annotations["description"]; exists && desc != "" {
			description = desc
		}
	}

	if description == "" {
		switch toolCRD.Spec.Type {
		case ToolTypeHTTP:
			if toolCRD.Spec.HTTP != nil {
				description = fmt.Sprintf("HTTP request to %s", toolCRD.Spec.HTTP.URL)
			}
		default:
			description = fmt.Sprintf("Custom tool: %s", toolCRD.Name)
		}
	}

	parameters := map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
	if toolCRD.Spec.InputSchema != nil && len(toolCRD.Spec.InputSchema.Raw) > 0 {
		// Parse runtime.RawExtension to map[string]any
		if err := json.Unmarshal(toolCRD.Spec.InputSchema.Raw, &parameters); err != nil {
			logf.Log.Error(err, "failed to unmarshal tool input schema")
		}
	}

	return ToolDefinition{Name: toolCRD.Name, Description: description, Parameters: parameters}
}

func CreateHTTPTool(toolCRD *arkv1alpha1.Tool) ToolDefinition {
	return CreateToolFromCRD(toolCRD)
}

func (h *HTTPExecutor) resolveHeaderValue(ctx context.Context, headerValue arkv1alpha1.HeaderValue, namespace string) (string, error) {
	// If static value is provided, use it directly
	if headerValue.Value != "" {
		return headerValue.Value, nil
	}

	// If secret reference is provided, resolve it
	if headerValue.ValueFrom != nil && headerValue.ValueFrom.SecretKeyRef != nil {
		secretRef := headerValue.ValueFrom.SecretKeyRef
		secret := &corev1.Secret{}

		namespacedName := types.NamespacedName{
			Name:      secretRef.Name,
			Namespace: namespace,
		}

		if err := h.K8sClient.Get(ctx, namespacedName, secret); err != nil {
			return "", fmt.Errorf("failed to get secret %s/%s: %w", namespace, secretRef.Name, err)
		}

		if secret.Data == nil {
			return "", fmt.Errorf("secret %s/%s has no data", namespace, secretRef.Name)
		}

		value, exists := secret.Data[secretRef.Key]
		if !exists {
			return "", fmt.Errorf("key %s not found in secret %s/%s", secretRef.Key, namespace, secretRef.Name)
		}

		return string(value), nil
	}

	return "", fmt.Errorf("header value must specify either value or valueFrom.secretKeyRef")
}
