package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
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
func (p *MCPClientPool) GetOrCreateClient(ctx context.Context, serverName, serverNamespace, serverURL string, headers map[string]string, transport string, timeout time.Duration, mcpSettings map[string]MCPSettings) (*MCPClient, error) {
	key := fmt.Sprintf("%s/%s", serverNamespace, serverName)
	if mcpClient, exists := p.clients[key]; exists {
		return mcpClient, nil
	}

	// Get MCP settings for this server if available
	mcpSetting := mcpSettings[key]

	// Create new client for this MCP server
	mcpClient, err := NewMCPClient(ctx, serverURL, headers, transport, timeout, mcpSetting)
	if err != nil {
		return nil, err
	}

	p.clients[key] = mcpClient
	return mcpClient, nil
}

// Close closes all MCP client connections in the pool
func (p *MCPClientPool) Close() error {
	var lastErr error
	for key, mcpClient := range p.clients {
		if mcpClient != nil && mcpClient.client != nil {
			if err := mcpClient.client.Close(); err != nil {
				lastErr = fmt.Errorf("failed to close MCP client %s: %w", key, err)
			}
		}
		delete(p.clients, key)
	}
	return lastErr
}

func (r *ToolRegistry) registerTools(ctx context.Context, k8sClient client.Client, agent *arkv1alpha1.Agent, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) error {
	for _, agentTool := range agent.Spec.Tools {
		if err := r.registerTool(ctx, k8sClient, agentTool, agent.Namespace, telemetryProvider, eventingProvider); err != nil {
			return err
		}
	}
	return nil
}

func CreateToolExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string, mcpPool *MCPClientPool, mcpSettings map[string]MCPSettings, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) (ToolExecutor, error) {
	switch tool.Spec.Type {
	case ToolTypeHTTP:
		return createHTTPExecutor(k8sClient, tool, namespace)
	case ToolTypeMCP:
		return createMCPExecutor(ctx, k8sClient, tool, namespace, mcpPool, mcpSettings)
	case ToolTypeAgent:
		return createAgentExecutor(ctx, k8sClient, tool, namespace, telemetryProvider, eventingProvider)
	case ToolTypeTeam:
		return createTeamExecutor(ctx, k8sClient, tool, namespace, telemetryProvider, eventingProvider)
	case ToolTypeBuiltin:
		return createBuiltinExecutor(tool)
	default:
		return nil, fmt.Errorf("unsupported tool type %s for tool %s", tool.Spec.Type, tool.Name)
	}
}

func createAgentExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) (ToolExecutor, error) {
	if tool.Spec.Agent.Name == "" {
		return nil, fmt.Errorf("agent spec is required for tool %s", tool.Name)
	}

	agentCRD := &arkv1alpha1.Agent{}
	key := types.NamespacedName{Name: tool.Spec.Agent.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, agentCRD); err != nil {
		return nil, fmt.Errorf("failed to get agent %v: %w", key, err)
	}

	return &AgentToolExecutor{
		AgentName: tool.Spec.Agent.Name,
		Namespace: namespace,
		AgentCRD:  agentCRD,
		k8sClient: k8sClient,
		telemetry: telemetryProvider,
		eventing:  eventingProvider,
	}, nil
}

func createTeamExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) (ToolExecutor, error) {
	if tool.Spec.Team.Name == "" {
		return nil, fmt.Errorf("team spec is required for tool %s", tool.Name)
	}

	teamCRD := &arkv1alpha1.Team{}
	key := types.NamespacedName{Name: tool.Spec.Team.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, teamCRD); err != nil {
		return nil, fmt.Errorf("failed to get team %v: %w", key, err)
	}

	return &TeamToolExecutor{
		TeamName:          tool.Spec.Team.Name,
		Namespace:         namespace,
		TeamCRD:           teamCRD,
		k8sClient:         k8sClient,
		telemetryProvider: telemetryProvider,
		eventingProvider:  eventingProvider,
	}, nil
}

func createBuiltinExecutor(tool *arkv1alpha1.Tool) (ToolExecutor, error) {
	switch tool.Name {
	case BuiltinToolNoop:
		return &NoopExecutor{}, nil
	case BuiltinToolTerminate:
		return &TerminateExecutor{}, nil
	default:
		return nil, fmt.Errorf("unsupported builtin tool %s", tool.Name)
	}
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

func createMCPExecutor(ctx context.Context, k8sClient client.Client, tool *arkv1alpha1.Tool, namespace string, mcpPool *MCPClientPool, mcpSettings map[string]MCPSettings) (ToolExecutor, error) {
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

	// Parse timeout from MCPServer spec (default to 30s if not specified)
	timeout := 30 * time.Second
	if mcpServerCRD.Spec.Timeout != "" {
		parsedTimeout, err := time.ParseDuration(mcpServerCRD.Spec.Timeout)
		if err != nil {
			return nil, fmt.Errorf("failed to parse timeout %s: %w", mcpServerCRD.Spec.Timeout, err)
		}
		timeout = parsedTimeout
	}

	// Use the MCP client pool to get or create the client
	mcpClient, err := mcpPool.GetOrCreateClient(
		ctx,
		tool.Spec.MCP.MCPServerRef.Name,
		mcpServerNamespace,
		mcpURL,
		headers,
		mcpServerCRD.Spec.Transport,
		timeout,
		mcpSettings,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get or create MCP client for tool %s: %w", tool.Name, err)
	}

	return &MCPExecutor{
		ToolName:  tool.Spec.MCP.ToolName,
		MCPClient: mcpClient,
	}, nil
}

func (r *ToolRegistry) registerTool(ctx context.Context, k8sClient client.Client, agentTool arkv1alpha1.AgentTool, namespace string, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) error {
	tool := &arkv1alpha1.Tool{}

	toolName := agentTool.GetToolCRDName()

	key := client.ObjectKey{Name: toolName, Namespace: namespace}

	if err := k8sClient.Get(ctx, key, tool); err != nil {
		return fmt.Errorf("failed to get tool %s: %w", toolName, err)
	}

	toolDef := CreateToolFromCRD(tool)

	// Set the exposed name (the name the agent will see)
	// For partial tools, this is agentTool.Name, not the actual CRD name
	toolDef.Name = agentTool.Name

	executor, err := CreateToolExecutor(ctx, k8sClient, tool, namespace, r.mcpPool, r.mcpSettings, telemetryProvider, eventingProvider)
	if err != nil {
		return fmt.Errorf("failed to create executor for tool %s: %w", toolDef.Name, err)
	}

	// Override description if provided at the agent tool level
	if agentTool.Description != "" {
		toolDef.Description = agentTool.Description
	}

	// Apply partial modifications (parameter injection only - name already set above)
	if agentTool.Partial != nil {
		var err error
		toolDef, err = CreatePartialToolDefinition(toolDef, agentTool.Partial)
		if err != nil {
			return fmt.Errorf("failed to create partial tool definition for tool %s: %w", toolName, err)
		}
		// Wrap with PartialToolExecutor if partial is specified
		executor = &PartialToolExecutor{
			BaseExecutor: executor,
			Partial:      agentTool.Partial,
			K8sClient:    k8sClient,
			Namespace:    namespace,
		}
	}

	// Apply function filtering if specified
	if len(agentTool.Functions) > 0 {
		executor = &FilteredToolExecutor{
			BaseExecutor: executor,
			Functions:    agentTool.Functions,
		}
	}

	r.RegisterTool(toolDef, executor)
	return nil
}

// AgentToolExecutor executes agent tools by calling other agents via MCP
type AgentToolExecutor struct {
	AgentName string
	Namespace string
	AgentCRD  *arkv1alpha1.Agent
	k8sClient client.Client
	telemetry telemetry.Provider
	eventing  eventing.Provider
}

type delegatedInvocation struct {
	userInput    Message
	history      []Message
	a2aUserInput protocol.Message
	a2aHistory   []protocol.Message
	contextID    string
}

func resolveDelegationMode(ctx context.Context, targetAnnotations map[string]string) string {
	return ResolveDelegationPayloadMode(ctx, targetAnnotations)
}

func parseLegacyDelegationInput(arguments map[string]any, targetType, targetName string) (delegatedInvocation, string, error) {
	input, exists := arguments["input"]
	if !exists {
		return delegatedInvocation{}, "input parameter is required", fmt.Errorf("input parameter is required for %s tool %s", targetType, targetName)
	}
	inputStr, ok := input.(string)
	if !ok {
		return delegatedInvocation{}, "input parameter must be a string", fmt.Errorf("input parameter must be a string for %s tool %s", targetType, targetName)
	}
	return delegatedInvocation{
		userInput: NewUserMessage(inputStr),
		history:   []Message{},
	}, "", nil
}

func parseA2AMessageArgument(rawValue any) (protocol.Message, error) {
	rawJSON, err := json.Marshal(rawValue)
	if err != nil {
		return protocol.Message{}, fmt.Errorf("failed to serialize message argument: %w", err)
	}
	var message protocol.Message
	if err := json.Unmarshal(rawJSON, &message); err != nil {
		return protocol.Message{}, fmt.Errorf("failed to parse message argument: %w", err)
	}
	if len(message.Parts) == 0 {
		return protocol.Message{}, fmt.Errorf("message argument must include at least one part")
	}
	return message, nil
}

func parseA2AHistoryArgument(rawValue any) ([]protocol.Message, error) {
	rawJSON, err := json.Marshal(rawValue)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize history argument: %w", err)
	}
	var history []protocol.Message
	if err := json.Unmarshal(rawJSON, &history); err != nil {
		return nil, fmt.Errorf("failed to parse history argument: %w", err)
	}
	return history, nil
}

func parseNativeDelegationInput(arguments map[string]any, targetType, targetName string) (delegatedInvocation, string, error) {
	invocation := delegatedInvocation{
		a2aHistory: []protocol.Message{},
	}
	if rawContextID, exists := arguments["contextId"]; exists {
		contextID, ok := rawContextID.(string)
		if !ok {
			return delegatedInvocation{}, "contextId parameter must be a string", fmt.Errorf("contextId parameter must be a string for %s tool %s", targetType, targetName)
		}
		normalizedContextID, err := normalizeContextID(contextID)
		if err != nil {
			return delegatedInvocation{}, "contextId parameter is invalid", err
		}
		invocation.contextID = normalizedContextID
	}
	if rawHistory, exists := arguments["history"]; exists {
		history, err := parseA2AHistoryArgument(rawHistory)
		if err != nil {
			return delegatedInvocation{}, "history parameter is invalid", err
		}
		invocation.a2aHistory = history
	}
	if rawMessage, exists := arguments["message"]; exists {
		message, err := parseA2AMessageArgument(rawMessage)
		if err != nil {
			return delegatedInvocation{}, "message parameter is invalid", err
		}
		invocation.a2aUserInput = message
		return invocation, "", nil
	}
	input, exists := arguments["input"]
	if !exists {
		return delegatedInvocation{}, "message parameter is required", fmt.Errorf("message parameter is required for %s tool %s", targetType, targetName)
	}
	inputStr, ok := input.(string)
	if !ok {
		return delegatedInvocation{}, "input parameter must be a string", fmt.Errorf("input parameter must be a string for %s tool %s", targetType, targetName)
	}
	invocation.a2aUserInput = protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart(inputStr),
	})
	return invocation, "", nil
}

func parseDelegatedInvocation(arguments map[string]any, payloadMode, targetType, targetName string) (delegatedInvocation, string, error) {
	if payloadMode == A2APayloadModeNative {
		return parseNativeDelegationInput(arguments, targetType, targetName)
	}
	return parseLegacyDelegationInput(arguments, targetType, targetName)
}

func applyDelegationContext(ctx context.Context, payloadMode, contextID string) context.Context {
	ctx = WithA2AExperimentalEnabled(ctx, payloadMode == A2APayloadModeNative)
	ctx = WithA2APayloadMode(ctx, payloadMode)
	if contextID == "" {
		return ctx
	}
	return WithA2AContextID(ctx, contextID)
}

func getDelegationEventStream(ctx context.Context, payloadMode string) EventStreamInterface {
	if payloadMode != A2APayloadModeNative {
		return nil
	}
	return GetToolEventStream(ctx)
}

func normalizeContextID(contextID string) (string, error) {
	trimmed := strings.TrimSpace(contextID)
	if contextID != "" && trimmed == "" {
		return "", fmt.Errorf("contextId parameter must not contain only whitespace")
	}
	if len(trimmed) > 1024 {
		return "", fmt.Errorf("contextId parameter exceeds max length")
	}
	return trimmed, nil
}

func serializeArtifactPart(part protocol.Part) map[string]interface{} {
	taskPart := convertPartFromProtocol(part)
	result := map[string]interface{}{
		"kind": taskPart.Kind,
	}
	if taskPart.Text != "" {
		result["text"] = taskPart.Text
	}
	if taskPart.Data != "" {
		result["data"] = taskPart.Data
	}
	if taskPart.MimeType != "" {
		result["mimeType"] = taskPart.MimeType
	}
	if taskPart.URI != "" {
		result["uri"] = taskPart.URI
	}
	if len(taskPart.Metadata) > 0 {
		result["metadata"] = taskPart.Metadata
	}
	return result
}

func serializeA2AMessage(message *protocol.Message) map[string]interface{} {
	if message == nil {
		return nil
	}
	result := map[string]interface{}{
		"role": message.Role,
	}
	if message.MessageID != "" {
		result["messageId"] = message.MessageID
	}
	if message.TaskID != nil && *message.TaskID != "" {
		result["taskId"] = *message.TaskID
	}
	if message.ContextID != nil && *message.ContextID != "" {
		result["contextId"] = *message.ContextID
	}
	parts := make([]map[string]interface{}, 0, len(message.Parts))
	for _, part := range message.Parts {
		parts = append(parts, serializeArtifactPart(part))
	}
	if len(parts) > 0 {
		result["parts"] = parts
	}
	if len(message.Metadata) > 0 {
		result["metadata"] = message.Metadata
	}
	return result
}

func serializeA2AArtifacts(artifacts []protocol.Artifact) []map[string]interface{} {
	serialized := make([]map[string]interface{}, 0, len(artifacts))
	for _, artifact := range artifacts {
		item := map[string]interface{}{
			"artifactId": artifact.ArtifactID,
		}
		if artifact.Name != nil && *artifact.Name != "" {
			item["name"] = *artifact.Name
		}
		if artifact.Description != nil && *artifact.Description != "" {
			item["description"] = *artifact.Description
		}
		if len(artifact.Metadata) > 0 {
			item["metadata"] = artifact.Metadata
		}
		parts := make([]map[string]interface{}, 0, len(artifact.Parts))
		for _, part := range artifact.Parts {
			parts = append(parts, serializeArtifactPart(part))
		}
		if len(parts) > 0 {
			item["parts"] = parts
		}
		serialized = append(serialized, item)
	}
	return serialized
}

func buildDelegatedToolResultMetadata(result *ExecutionResult) map[string]interface{} {
	if result == nil {
		return nil
	}
	metadata := map[string]interface{}{}
	if result.A2AResponse != nil {
		if result.A2AResponse.ContextID != "" {
			metadata["contextId"] = result.A2AResponse.ContextID
		}
		if result.A2AResponse.TaskID != "" {
			metadata["taskId"] = result.A2AResponse.TaskID
		}
		if result.A2AResponse.Message != nil {
			metadata["message"] = serializeA2AMessage(result.A2AResponse.Message)
		}
		if len(result.A2AResponse.Artifacts) > 0 {
			metadata["artifacts"] = serializeA2AArtifacts(result.A2AResponse.Artifacts)
		}
	}
	if len(result.A2AMessages) > 0 {
		last := result.A2AMessages[len(result.A2AMessages)-1]
		if last.ContextID != nil && *last.ContextID != "" {
			metadata["contextId"] = *last.ContextID
		}
		if last.TaskID != nil && *last.TaskID != "" {
			metadata["taskId"] = *last.TaskID
		}
		metadata["message"] = serializeA2AMessage(&last)
	}
	if len(metadata) == 0 {
		return nil
	}
	return metadata
}

func buildDelegatedToolResultContent(content string, metadata map[string]interface{}, experimentalNative bool) (string, error) {
	if len(metadata) == 0 {
		return content, nil
	}

	if experimentalNative {
		envelope := make(map[string]interface{}, len(metadata)+1)
		for key, value := range metadata {
			envelope[key] = value
		}
		if content != "" {
			envelope["content"] = content
		}
		raw, err := json.Marshal(envelope)
		if err != nil {
			return "", fmt.Errorf("failed to serialize native delegated tool result: %w", err)
		}
		return string(raw), nil
	}

	if content == "" {
		raw, err := json.Marshal(metadata)
		if err == nil {
			return string(raw), nil
		}
	}
	return content, nil
}

func (a *AgentToolExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	var arguments map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		log := logf.FromContext(ctx)
		log.Error(err, "Error parsing tool arguments", "ToolCall")
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "Failed to parse tool arguments",
		}, fmt.Errorf("failed to parse tool arguments: %v", err)
	}

	payloadMode := resolveDelegationMode(ctx, a.AgentCRD.Annotations)
	invocation, userError, err := parseDelegatedInvocation(arguments, payloadMode, "agent", a.AgentName)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: userError,
		}, err
	}

	agent, err := MakeAgent(ctx, a.k8sClient, a.AgentCRD, a.telemetry, a.eventing)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to create agent %s: %v", a.AgentName, err),
		}, err
	}

	execCtx := applyDelegationContext(ctx, payloadMode, invocation.contextID)
	eventStream := getDelegationEventStream(ctx, payloadMode)
	var result *ExecutionResult
	if payloadMode == A2APayloadModeNative {
		result, err = agent.ExecuteA2A(execCtx, invocation.a2aUserInput, invocation.a2aHistory, nil, eventStream)
	} else {
		result, err = agent.Execute(execCtx, invocation.userInput, invocation.history, nil, eventStream)
	}
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to execute agent %s: %v", a.AgentName, err),
		}, err
	}

	content := ""
	if len(result.A2AMessages) > 0 {
		content = ExtractA2ATextFromMessage(result.A2AMessages[len(result.A2AMessages)-1])
	} else {
		content = ExtractLastAssistantMessageContent(result.Messages)
	}
	metadata := buildDelegatedToolResultMetadata(result)
	if content == "" && result.A2AResponse != nil {
		content = result.A2AResponse.Content
	}
	experimentalNative := payloadMode == A2APayloadModeNative && IsA2AExperimentalEnabledInContext(execCtx)
	content, err = buildDelegatedToolResultContent(content, metadata, experimentalNative)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "failed to serialize delegated A2A result",
		}, err
	}
	if content == "" {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "agent execution returned no assistant message content",
		}, fmt.Errorf("agent %s execution returned no assistant message content", a.AgentName)
	}

	return ToolResult{
		ID:       call.ID,
		Name:     call.Function.Name,
		Content:  content,
		Metadata: metadata,
	}, nil
}

// TeamToolExecutor executes team tools by calling teams
type TeamToolExecutor struct {
	TeamName          string
	Namespace         string
	TeamCRD           *arkv1alpha1.Team
	k8sClient         client.Client
	telemetryProvider telemetry.Provider
	eventingProvider  eventing.Provider
}

func (t *TeamToolExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	var arguments map[string]any
	if err := json.Unmarshal([]byte(call.Function.Arguments), &arguments); err != nil {
		log := logf.FromContext(ctx)
		log.Error(err, "Error parsing tool arguments", "ToolCall")
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "Failed to parse tool arguments",
		}, fmt.Errorf("failed to parse tool arguments: %v", err)
	}

	payloadMode := resolveDelegationMode(ctx, t.TeamCRD.Annotations)
	invocation, userError, err := parseDelegatedInvocation(arguments, payloadMode, "team", t.TeamName)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: userError,
		}, err
	}

	team, err := MakeTeam(ctx, t.k8sClient, t.TeamCRD, t.telemetryProvider, t.eventingProvider)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to create team %s: %v", t.TeamName, err),
		}, err
	}

	execCtx := applyDelegationContext(ctx, payloadMode, invocation.contextID)
	eventStream := getDelegationEventStream(ctx, payloadMode)
	var result *ExecutionResult
	if payloadMode == A2APayloadModeNative {
		result, err = team.ExecuteA2A(execCtx, invocation.a2aUserInput, invocation.a2aHistory, nil, eventStream)
	} else {
		result, err = team.Execute(execCtx, invocation.userInput, invocation.history, nil, eventStream)
	}
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("failed to execute team %s: %v", t.TeamName, err),
		}, err
	}

	if len(result.Messages) == 0 && len(result.A2AMessages) == 0 {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "team execution returned no messages",
		}, fmt.Errorf("team %s execution returned no messages", t.TeamName)
	}

	content := ""
	if len(result.A2AMessages) > 0 {
		content = ExtractA2ATextFromMessage(result.A2AMessages[len(result.A2AMessages)-1])
	} else {
		content = ExtractLastAssistantMessageContent(result.Messages)
	}
	metadata := buildDelegatedToolResultMetadata(result)
	if content == "" && result.A2AResponse != nil {
		content = result.A2AResponse.Content
	}
	experimentalNative := payloadMode == A2APayloadModeNative && IsA2AExperimentalEnabledInContext(execCtx)
	content, err = buildDelegatedToolResultContent(content, metadata, experimentalNative)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "failed to serialize delegated A2A result",
		}, err
	}
	if content == "" {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: "team execution returned no assistant message content",
		}, fmt.Errorf("team %s execution returned no assistant message content", t.TeamName)
	}

	return ToolResult{
		ID:       call.ID,
		Name:     call.Function.Name,
		Content:  content,
		Metadata: metadata,
	}, nil
}
