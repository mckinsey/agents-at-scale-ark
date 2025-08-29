package genai

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// Add MCP client pool to ToolRegistry
type MCPClientPool struct {
	clients map[string]*MCPClient // key: mcpServerName
}

func NewMCPClientPool() *MCPClientPool {
	return &MCPClientPool{
		clients: make(map[string]*MCPClient),
	}
}

// GetOrCreateClient returns an existing MCP client or creates a new one for the given server
func (p *MCPClientPool) GetOrCreateClient(ctx context.Context, serverName, serverNamespace, serverURL string, headers map[string]string, transport string) (*MCPClient, error) {
	key := fmt.Sprintf("%s/%s", serverNamespace, serverName)
	if mcpClient, exists := p.clients[key]; exists {
		return mcpClient, nil
	}

	// Create new client for this MCP server
	mcpClient, err := NewMCPClient(ctx, serverURL, headers, transport)
	if err != nil {
		return nil, err
	}

	p.clients[key] = mcpClient
	return mcpClient, nil
}

func (r *ToolRegistry) registerTools(ctx context.Context, k8sClient client.Client, agent *arkv1alpha1.Agent) error {
	for _, agentTool := range agent.Spec.Tools {
		if err := r.registerTool(ctx, k8sClient, agentTool, agent.Namespace); err != nil {
			return err
		}
	}
	return nil
}

func (r *ToolRegistry) getToolCRD(ctx context.Context, k8sClient client.Client, name, namespace string) (*arkv1alpha1.Tool, error) {
	obj := &arkv1alpha1.Tool{}
	key := types.NamespacedName{Name: name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, obj); err != nil {
		return nil, fmt.Errorf("failed to load tool %v", key)
	}
	return obj, nil
}

func (r *ToolRegistry) getToolsBySelector(ctx context.Context, k8sClient client.Client, labelSelector *labels.Selector, namespace string) ([]arkv1alpha1.Tool, error) {
	toolList := &arkv1alpha1.ToolList{}

	if err := k8sClient.List(ctx, toolList, client.InNamespace(namespace), client.MatchingLabelsSelector{Selector: *labelSelector}); err != nil {
		return nil, fmt.Errorf("failed to list tools with label selector: %w", err)
	}

	return toolList.Items, nil
}

func (r *ToolRegistry) registerCustomTool(ctx context.Context, k8sClient client.Client, agentTool arkv1alpha1.AgentTool, namespace string) error {
	var tools []arkv1alpha1.Tool

	switch {
	case agentTool.Name != "":
		tool, err := r.getToolCRD(ctx, k8sClient, agentTool.Name, namespace)
		if err != nil {
			return err
		}
		tools = []arkv1alpha1.Tool{*tool}
	case agentTool.LabelSelector != nil:
		selector, err := labels.ValidatedSelectorFromSet(agentTool.LabelSelector.MatchLabels)
		if err != nil {
			return fmt.Errorf("invalid label selector: %w", err)
		}
		foundTools, err := r.getToolsBySelector(ctx, k8sClient, &selector, namespace)
		if err != nil {
			return err
		}
		tools = foundTools
	default:
		return fmt.Errorf("either name or labelSelector must be specified for custom tool")
	}

	for _, tool := range tools {
		if err := r.registerSingleCustomTool(ctx, k8sClient, tool, namespace, agentTool.Functions); err != nil {
			return fmt.Errorf("failed to register tool %s: %w", tool.Name, err)
		}
	}

	return nil
}

func CreateToolExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string) (ToolExecutor, error) {
	switch tool.Spec.Type {
	case ToolTypeHTTP:
		if tool.Spec.HTTP == nil {
			return nil, fmt.Errorf("http spec is required for tool %s", tool.Name)
		}
		return &HTTPExecutor{
			K8sClient:     k8sClient,
			ToolName:      tool.Name,
			ToolNamespace: namespace,
		}, nil
	case ToolTypeMCP:
		if tool.Spec.MCP == nil {
			return nil, fmt.Errorf("mcp spec is required for tool %s", tool.Name)
		}

		mcpServerNamespace := tool.Spec.MCP.MCPServerRef.Namespace
		if mcpServerNamespace == "" {
			mcpServerNamespace = namespace
		}

		var mcpServerCRD arkv1alpha1.MCPServer
		mcpServerKey := types.NamespacedName{
			Name:      tool.Spec.MCP.MCPServerRef.Name,
			Namespace: mcpServerNamespace,
		}
		if err := k8sClient.Get(ctx, mcpServerKey, &mcpServerCRD); err != nil {
			return nil, fmt.Errorf("failed to get MCP server %v: %w", mcpServerKey, err)
		}

		mcpURL, err := BuildMCPServerURL(ctx, k8sClient, &mcpServerCRD)
		if err != nil {
			return nil, fmt.Errorf("failed to build MCP server URL: %w", err)
		}

		headers := make(map[string]string)
		for _, header := range mcpServerCRD.Spec.Headers {
			value, err := ResolveHeaderValue(ctx, k8sClient, header, namespace)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve header %s: %w", header.Name, err)
			}
			headers[header.Name] = value
		}

		mcpClient, err := NewMCPClient(ctx, mcpURL, headers, mcpServerCRD.Spec.Transport)
		if err != nil {
			return nil, fmt.Errorf("failed to create MCP client for tool %s: %w", tool.Name, err)
		}

		return &MCPExecutor{
			ToolName:  tool.Spec.MCP.ToolName,
			MCPClient: mcpClient,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported tool type %s for tool %s", tool.Spec.Type, tool.Name)
	}
}

func (r *ToolRegistry) registerSingleCustomTool(ctx context.Context, k8sClient client.Client, tool arkv1alpha1.Tool, namespace string, functions []arkv1alpha1.ToolFunction) error {
	toolDef := CreateToolFromCRD(&tool)
	executor, err := CreateToolExecutor(ctx, k8sClient, &tool, namespace)
	if err != nil {
		return err
	}

	if len(functions) > 0 {
		executor = &FilteredToolExecutor{
			BaseExecutor: executor,
			Functions:    functions,
		}
	}

	r.RegisterTool(toolDef, executor)
	return nil
}

func (r *ToolRegistry) registerTool(ctx context.Context, k8sClient client.Client, agentTool arkv1alpha1.AgentTool, namespace string) error {
	switch agentTool.Type {
	case AgentToolTypeBuiltIn:
		switch agentTool.Name {
		case "noop":
			r.RegisterTool(GetNoopTool(), &NoopExecutor{})
		case "terminate":
			r.RegisterTool(GetTerminateTool(), &TerminateExecutor{})
		default:
			return fmt.Errorf("unsupported built-in tool %s", agentTool.Name)
		}
	case AgentToolTypeCustom:
		if err := r.registerCustomTool(ctx, k8sClient, agentTool, namespace); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported tool type %s %s", agentTool.Type, agentTool.Name)
	}
	return nil
}
