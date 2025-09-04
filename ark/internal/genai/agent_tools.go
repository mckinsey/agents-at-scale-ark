package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

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

func (r *ToolRegistry) registerCustomTool(ctx context.Context, k8sClient client.Client, agentTool arkv1alpha1.AgentTool, namespace string) error {
	if agentTool.Name == "" {
		return fmt.Errorf("name must be specified for custom tool")
	}

	tool, err := r.getToolCRD(ctx, k8sClient, agentTool.Name, namespace)
	if err != nil {
		return err
	}

	if err := r.registerSingleCustomTool(ctx, k8sClient, *tool, namespace, agentTool.Functions); err != nil {
		return fmt.Errorf("failed to register tool %s: %w", tool.Name, err)
	}

	return nil
}

func CreateToolExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string) (ToolExecutor, error) {
	switch tool.Spec.Type {
	case ToolTypeHTTP:
		return createHTTPExecutor(k8sClient, tool, namespace)
	case ToolTypeMCP:
		return createMCPExecutor(ctx, k8sClient, tool, namespace)
	case ToolTypeAgent:
		return createAgentExecutor(ctx, k8sClient, tool, namespace)
	default:
		return nil, fmt.Errorf("unsupported tool type %s for tool %s", tool.Spec.Type, tool.Name)
	}
}

func createAgentExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string) (ToolExecutor, error) {
	if tool.Spec.Agent == "" {
		return nil, fmt.Errorf("agent spec is required for tool %s", tool.Name)
	}

	agentCRD := &arkv1alpha1.Agent{}
	key := types.NamespacedName{Name: tool.Spec.Agent, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, agentCRD); err != nil {
		return nil, fmt.Errorf("failed to get agent %v: %w", key, err)
	}

	return &AgentToolExecutor{
		AgentName: tool.Spec.Agent,
		Namespace: namespace,
		AgentCRD:  agentCRD,
		k8sClient: k8sClient,
	}, nil
}

func createHTTPExecutor(k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string) (ToolExecutor, error) {
	if tool.Spec.HTTP == nil {
		return nil, fmt.Errorf("http spec is required for tool %s", tool.Name)
	}
	return &HTTPExecutor{
		K8sClient:     k8sClient,
		ToolName:      tool.Name,
		ToolNamespace: namespace,
	}, nil
}

func createMCPExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string) (ToolExecutor, error) {
	if tool.Spec.MCP == nil {
		return nil, fmt.Errorf("mcp spec is required for tool %s", tool.Name)
	}

	mcpNamespace := tool.Spec.MCP.MCPServerRef.Namespace
	if mcpNamespace == "" {
		mcpNamespace = namespace
	}

	var mcpServer arkv1alpha1.MCPServer
	key := types.NamespacedName{Name: tool.Spec.MCP.MCPServerRef.Name, Namespace: mcpNamespace}
	if err := k8sClient.Get(ctx, key, &mcpServer); err != nil {
		return nil, fmt.Errorf("failed to get MCP server %v: %w", key, err)
	}

	url, err := BuildMCPServerURL(ctx, k8sClient, &mcpServer)
	if err != nil {
		return nil, err
	}

	headers := map[string]string{}
	for _, h := range mcpServer.Spec.Headers {
		val, err := ResolveHeaderValue(ctx, k8sClient, h, namespace)
		if err != nil {
			return nil, err
		}
		headers[h.Name] = val
	}

	mcpClient, err := NewMCPClient(ctx, url, headers, mcpServer.Spec.Transport)
	if err != nil {
		return nil, err
	}

	return &MCPExecutor{ToolName: tool.Spec.MCP.ToolName, MCPClient: mcpClient}, nil
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

// AgentToolExecutor executes agent tools by calling other agents via MCP
type AgentToolExecutor struct {
	AgentName string
	Namespace string
	AgentCRD  *arkv1alpha1.Agent
	k8sClient client.Client
}

func (a *AgentToolExecutor) Execute(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
	var arguments map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		log := logf.FromContext(ctx)
		log.Info("Error parsing tool arguments", "ToolCall", call)
		arguments = make(map[string]any)
	}

	input, exists := arguments["input"]
	if !exists {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "input parameter is required",
		}, fmt.Errorf("input parameter is required for agent tool %s", a.AgentName)
	}

	inputStr, ok := input.(string)
	if !ok {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "input parameter must be a string",
		}, fmt.Errorf("input parameter must be a string for agent tool %s", a.AgentName)
	}

	// Log the agent execution
	log := logf.FromContext(ctx)
	log.Info("calling agent directly", "agent", a.AgentName, "namespace", a.Namespace, "input", inputStr)

	// Create the Agent object using the Agent CRD and recorder
	agent, err := MakeAgent(ctx, a.k8sClient, a.AgentCRD, recorder)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to create agent %s: %v", a.AgentName, err),
		}, err
	}

	// Prepare user input and history
	userInput := NewSystemMessage(inputStr)
	history := []Message{} // Provide history if applicable

	// Call the agent's Execute function
	responseMessages, err := agent.Execute(ctx, userInput, history)
	if err != nil {
		log.Info("agent execution error", "agent", a.AgentName, "error", err)
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to execute agent %s: %v", a.AgentName, err),
		}, err
	}

	lastMessage := responseMessages[len(responseMessages)-1]

	log.Info("agent direct call response", "agent", a.AgentName, "response", lastMessage.OfAssistant.Content.OfString.Value)

	return ToolResult{
		ID:      call.ID,
		Name:    call.Function.Name,
		Content: lastMessage.OfAssistant.Content.OfString.Value,
	}, nil
}
