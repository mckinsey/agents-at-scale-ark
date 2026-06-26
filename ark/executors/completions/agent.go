package completions

import (
	"context"
	"errors"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
	"github.com/openai/openai-go/shared/constant"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing"
	arkmcp "mckinsey.com/ark/internal/mcp"
	"mckinsey.com/ark/internal/telemetry"
)

type Agent struct {
	Name                  string
	Namespace             string
	Prompt                string
	Description           string
	Parameters            []arkv1alpha1.Parameter
	Model                 *Model
	Tools                 *ToolRegistry
	telemetryRecorder     telemetry.AgentRecorder
	eventingRecorder      eventing.AgentRecorder
	eventing              eventing.Provider
	ExecutionEngine       *arkv1alpha1.ExecutionEngineRef
	Annotations           map[string]string
	OutputSchema          *runtime.RawExtension
	client                client.Client
	approvalRequiredTools map[string]*arkv1alpha1.ToolApprovalConfig
}

// FullName returns the namespace/name format for the agent
func (a *Agent) FullName() string {
	return a.Namespace + "/" + a.Name
}

func (a *Agent) Close() {
	if a.Tools != nil {
		_ = a.Tools.Close()
	}
}

func (a *Agent) GetToolRegistry() *ToolRegistry {
	return a.Tools
}

// Execute executes the agent with optional event emission for tool calls.
// opts carries caller-controlled options such as forcing a tool call; pass ExecuteOptions{} for defaults.
func (a *Agent) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface, opts ExecuteOptions) (*ExecutionResult, error) {
	ctx, span := a.telemetryRecorder.StartAgentExecution(ctx, a.Name, a.Namespace)
	defer span.End()

	ctx = WithExecutionMetadata(ctx, map[string]interface{}{
		"agent": a.Name,
	})

	operationData := map[string]string{
		"agent": a.FullName(),
	}
	ctx = a.eventingRecorder.Start(ctx, "AgentExecution", fmt.Sprintf("Executing agent %s", a.FullName()), operationData)

	result, err := a.executeAgent(ctx, userInput, history, memory, eventStream, opts)
	if err != nil {
		if signalResult, handled := a.handleSignalError(ctx, span, result, err, operationData); handled {
			return signalResult, nil
		}
		var approvalErr *ApprovalRequiredError
		if errors.As(err, &approvalErr) {
			a.telemetryRecorder.RecordSuccess(span)
			a.eventingRecorder.Complete(ctx, "AgentExecution", "Agent execution paused for tool approval", operationData)
			return result, err
		}
		a.telemetryRecorder.RecordError(span, err)
		a.eventingRecorder.Fail(ctx, "AgentExecution", fmt.Sprintf("Agent execution failed: %v", err), err, operationData)
		return nil, err
	}

	a.telemetryRecorder.RecordSuccess(span)
	a.eventingRecorder.Complete(ctx, "AgentExecution", "Agent execution completed successfully", operationData)
	return result, nil
}

func (a *Agent) handleSignalError(ctx context.Context, span telemetry.Span, result *ExecutionResult, err error, operationData map[string]string) (*ExecutionResult, bool) {
	if result == nil {
		result = &ExecutionResult{}
	}
	if IsTerminateTeam(err) {
		result.Signal = &TerminateSignal{}
		a.telemetryRecorder.RecordSuccess(span)
		a.eventingRecorder.Complete(ctx, "AgentExecution", "Agent execution completed with termination", operationData)
		return result, true
	}
	var selectionMade *SelectionMade
	if errors.As(err, &selectionMade) {
		result.Signal = &SelectionMadeSignal{SelectedName: selectionMade.SelectedName}
		a.telemetryRecorder.RecordSuccess(span)
		a.eventingRecorder.Complete(ctx, "AgentExecution", "Agent execution completed with selection", operationData)
		return result, true
	}
	return nil, false
}

func (a *Agent) executeAgent(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface, opts ExecuteOptions) (*ExecutionResult, error) {
	if a.ExecutionEngine != nil {
		return a.executeWithA2AExecutionEngine(ctx, userInput, eventStream)
	}

	messages, err := a.executeLocally(ctx, userInput, history, memory, eventStream, opts)
	if err != nil {
		if IsTerminateTeam(err) || IsSelectionMade(err) {
			return &ExecutionResult{Messages: messages}, err
		}
		return nil, err
	}
	return &ExecutionResult{Messages: messages}, nil
}

func (a *Agent) executeWithA2AExecutionEngine(ctx context.Context, userInput Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	a2aEngine := NewA2AExecutionEngine(a.client, a.eventing.A2aRecorder())
	contextID := GetA2AContextID(ctx)
	return a2aEngine.Execute(ctx, a.Name, a.Namespace, a.Annotations, contextID, userInput, eventStream)
}

func (a *Agent) prepareMessages(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	resolvedPrompt, err := a.resolvePrompt(ctx)
	if err != nil {
		return nil, fmt.Errorf("agent %s prompt resolution failed: %w", a.FullName(), err)
	}

	systemMessage := NewSystemMessage(resolvedPrompt)
	agentMessages := append([]Message{systemMessage}, history...)
	agentMessages = append(agentMessages, userInput)
	return agentMessages, nil
}

// executeModelCall executes a single model call with optional streaming support.
func (a *Agent) executeModelCall(ctx context.Context, agentMessages []Message, eventStream EventStreamInterface, tools []openai.ChatCompletionToolParam, toolChoice ToolChoice) (*openai.ChatCompletion, error) {
	a.Model.OutputSchema = a.OutputSchema
	a.Model.SchemaName = fmt.Sprintf("%.64s", fmt.Sprintf("namespace-%s-agent-%s", a.Namespace, a.Name))

	response, err := a.Model.ChatCompletion(ctx, agentMessages, eventStream, 1, tools, toolChoice)
	if err != nil {
		return nil, fmt.Errorf("agent %s execution failed: %w", a.FullName(), err)
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("agent %s received empty response", a.FullName())
	}

	return response, nil
}

func (a *Agent) processAssistantMessage(choice openai.ChatCompletionChoice) Message {
	assistantMessage := Message(choice.Message.ToParam())

	if m := assistantMessage.OfAssistant; m != nil {
		m.Name = param.NewOpt(a.Name)
	}

	return assistantMessage
}

func (a *Agent) executeToolCall(ctx context.Context, toolCall openai.ChatCompletionMessageToolCall) (Message, error) {
	result, err := a.Tools.ExecuteTool(ctx, ToolCall(toolCall))

	// If the result has an error field set, use that as the message content
	// This allows tool results to communicate errors (e.g., HITL rejection) back to the model
	content := result.Content
	if result.Error != "" {
		content = result.Error
	}
	toolMessage := ToolMessage(content, result.ID)

	if err != nil {
		return toolMessage, err
	}

	return toolMessage, nil
}

func (a *Agent) executeToolCalls(ctx context.Context, toolCalls []openai.ChatCompletionMessageToolCall, agentMessages, newMessages *[]Message) error {
	// First pass: check if any tools require approval
	var toolCallsNeedingApproval []ToolCall
	var approvalConfig *arkv1alpha1.ToolApprovalConfig

	for _, tc := range toolCalls {
		if config := a.requiresApproval(tc.Function.Name); config != nil {
			toolCallsNeedingApproval = append(toolCallsNeedingApproval, ToolCall(tc))
			if approvalConfig == nil {
				approvalConfig = config
			}
		}
	}

	// If any tools need approval, return error to pause execution
	if len(toolCallsNeedingApproval) > 0 {
		// Get conversation ID from query context
		conversationID := ""
		if query, ok := ctx.Value(QueryContextKey).(*arkv1alpha1.Query); ok {
			conversationID = query.Spec.ConversationId
		}

		execContext := &ExecutionContext{
			ConversationID:       conversationID,
			PendingToolCallIndex: 0,
			CompletedToolResults: []ToolResult{},
			AgentName:            a.Name,
			AgentNamespace:       a.Namespace,
		}

		return &ApprovalRequiredError{
			ToolCalls: toolCallsNeedingApproval,
			Config:    approvalConfig,
			Context:   execContext,
		}
	}

	// No approval needed, execute normally
	for _, tc := range toolCalls {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		toolMessage, err := a.executeToolCall(ctx, tc)
		*agentMessages = append(*agentMessages, toolMessage)
		*newMessages = append(*newMessages, toolMessage)

		if err != nil {
			return err
		}
	}
	return nil
}

// executeLocally executes the agent using the built-in OpenAI-compatible engine
func (a *Agent) executeLocally(ctx context.Context, userInput Message, history []Message, _ MemoryInterface, eventStream EventStreamInterface, opts ExecuteOptions) ([]Message, error) {
	var tools []openai.ChatCompletionToolParam
	if a.Tools != nil {
		tools = a.Tools.ToOpenAITools()
	}

	agentMessages, err := a.prepareMessages(ctx, userInput, history)
	if err != nil {
		return nil, err
	}

	if a.Model == nil {
		return nil, fmt.Errorf("agent %s has no model configured", a.FullName())
	}

	newMessages := []Message{}

	for {
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		response, err := a.executeModelCall(ctx, agentMessages, eventStream, tools, opts.ToolChoice)
		if err != nil {
			return nil, err
		}

		choice := response.Choices[0]
		assistantMessage := a.processAssistantMessage(choice)

		agentMessages = append(agentMessages, assistantMessage)
		newMessages = append(newMessages, assistantMessage)

		if len(choice.Message.ToolCalls) == 0 {
			return newMessages, nil
		}

		if err := a.executeToolCalls(ctx, choice.Message.ToolCalls, &agentMessages, &newMessages); err != nil {
			logger := logf.FromContext(ctx)
			if !IsTerminateTeam(err) && !IsSelectionMade(err) {
				logger.Error(err, "Tool execution failed", "agent", a.FullName())
			}
			return newMessages, err
		}
	}
}

// ResumeFromApproval resumes agent execution after tool approval is granted
// It takes the original tool calls and their execution results
func (a *Agent) ResumeFromApproval(ctx context.Context, toolCalls []openai.ChatCompletionMessageToolCall, approvedResults []ToolResult, memory MemoryInterface, eventStream EventStreamInterface, originalInput []Message) (*ExecutionResult, error) {
	if a.Model == nil {
		return nil, fmt.Errorf("agent %s has no model configured", a.FullName())
	}

	agentMessages, newMessages, err := a.reconstructMessagesForResumption(ctx, toolCalls, approvedResults, memory, originalInput)
	if err != nil {
		return nil, err
	}

	// Prepare tools
	var tools []openai.ChatCompletionToolParam
	if a.Tools != nil {
		tools = a.Tools.ToOpenAITools()
	}

	return a.runAgenticLoopFromResumption(ctx, agentMessages, newMessages, eventStream, tools)
}

func (a *Agent) GetName() string {
	return a.Name
}

func (a *Agent) GetType() string {
	return MemberTypeAgent
}

func (a *Agent) GetDescription() string {
	return a.Description
}

// ValidateExecutionEngine checks if the specified ExecutionEngine resource exists
func ValidateExecutionEngine(ctx context.Context, k8sClient client.Client, executionEngine *arkv1alpha1.ExecutionEngineRef, defaultNamespace string) error {
	// Resolve execution engine name and namespace
	engineName := executionEngine.Name
	namespace := executionEngine.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	// Pass validation for reserved 'a2a' execution engine (internal)
	if engineName == arka2a.ExecutionEngineA2A {
		return nil
	}

	// Check if ExecutionEngine CRD exists
	var engineCRD arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: engineName, Namespace: namespace}
	if err := k8sClient.Get(ctx, engineKey, &engineCRD); err != nil {
		return fmt.Errorf("execution engine %s not found in namespace %s: %w", engineName, namespace, err)
	}

	return nil
}

func resolveModelHeadersForAgent(ctx context.Context, k8sClient client.Client, agentCRD *arkv1alpha1.Agent, queryCRD *arkv1alpha1.Query) (map[string]string, error) {
	agentHeadersMap, err := ResolveHeadersFromOverrides(ctx, k8sClient, agentCRD.Spec.Overrides, agentCRD.Namespace, OverrideTypeModel)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve model headers for agent %s/%s: %w", agentCRD.Namespace, agentCRD.Name, err)
	}

	queryHeadersMap, err := ResolveHeadersFromOverrides(ctx, k8sClient, queryCRD.Spec.Overrides, queryCRD.Namespace, OverrideTypeModel)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve model headers from query %s/%s: %w", queryCRD.Namespace, queryCRD.Name, err)
	}

	var modelHeaders map[string]string
	if agentCRD.Spec.ModelRef != nil {
		agentHeaders := agentHeadersMap[agentCRD.Spec.ModelRef.Name]
		queryHeaders := queryHeadersMap[agentCRD.Spec.ModelRef.Name]

		modelHeaders = make(map[string]string)
		for k, v := range agentHeaders {
			modelHeaders[k] = v
		}
		for k, v := range queryHeaders {
			modelHeaders[k] = v
		}
	}

	return modelHeaders, nil
}

func resolveMCPSettingsForAgent(ctx context.Context, k8sClient client.Client, agentCRD *arkv1alpha1.Agent, queryCRD *arkv1alpha1.Query, queryMCPSettings map[string]arkmcp.MCPSettings) (map[string]arkmcp.MCPSettings, error) {
	agentHeadersMap, err := ResolveHeadersFromOverrides(ctx, k8sClient, agentCRD.Spec.Overrides, agentCRD.Namespace, OverrideTypeMCPServer)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve MCP headers for agent %s/%s: %w", agentCRD.Namespace, agentCRD.Name, err)
	}

	queryHeadersMap, err := ResolveHeadersFromOverrides(ctx, k8sClient, queryCRD.Spec.Overrides, queryCRD.Namespace, OverrideTypeMCPServer)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve MCP headers from query %s/%s: %w", queryCRD.Namespace, queryCRD.Name, err)
	}

	mcpSettings := queryMCPSettings
	if mcpSettings == nil {
		mcpSettings = make(map[string]arkmcp.MCPSettings)
	}

	for mcpKey, headers := range agentHeadersMap {
		key := fmt.Sprintf("%s/%s", agentCRD.Namespace, mcpKey)
		setting := mcpSettings[key]
		setting.Headers = headers
		mcpSettings[key] = setting
	}

	for mcpKey, headers := range queryHeadersMap {
		key := fmt.Sprintf("%s/%s", queryCRD.Namespace, mcpKey)
		setting := mcpSettings[key]
		mergedHeaders := make(map[string]string)
		for k, v := range setting.Headers {
			mergedHeaders[k] = v
		}
		for k, v := range headers {
			mergedHeaders[k] = v
		}
		setting.Headers = mergedHeaders
		mcpSettings[key] = setting
	}

	return mcpSettings, nil
}

func MakeAgent(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Agent, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) (*Agent, error) {
	queryCrd, ok := ctx.Value(QueryContextKey).(*arkv1alpha1.Query)
	if !ok {
		return nil, fmt.Errorf("missing query context for agent %s/%s", crd.Namespace, crd.Name)
	}

	modelHeaders, err := resolveModelHeadersForAgent(ctx, k8sClient, crd, queryCrd)
	if err != nil {
		return nil, err
	}

	var resolvedModel *Model

	// A2A agents don't need models - they delegate to external A2A servers
	if crd.Spec.ExecutionEngine == nil || crd.Spec.ExecutionEngine.Name != arka2a.ExecutionEngineA2A {
		var err error
		resolvedModel, err = LoadModel(ctx, k8sClient, crd.Spec.ModelRef, crd.Namespace, modelHeaders, telemetryProvider.ModelRecorder(), eventingProvider.ModelRecorder())
		if err != nil {
			return nil, fmt.Errorf("failed to load model for agent %s/%s: %w", crd.Namespace, crd.Name, err)
		}
	}

	if crd.Spec.ExecutionEngine != nil {
		err := ValidateExecutionEngine(ctx, k8sClient, crd.Spec.ExecutionEngine, crd.Namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to validate execution engine %s for agent %s/%s: %w",
				crd.Spec.ExecutionEngine.Name, crd.Namespace, crd.Name, err)
		}
	}

	query, err := MakeQuery(queryCrd)
	if err != nil {
		return nil, fmt.Errorf("failed to make query from context for agent %s/%s: %w", crd.Namespace, crd.Name, err)
	}

	mcpSettings, err := resolveMCPSettingsForAgent(ctx, k8sClient, crd, queryCrd, query.McpSettings)
	if err != nil {
		return nil, err
	}

	tools := NewToolRegistry(mcpSettings, telemetryProvider.ToolRecorder(), eventingProvider.ToolRecorder())

	if err := tools.registerTools(ctx, k8sClient, crd, telemetryProvider, eventingProvider); err != nil {
		return nil, err
	}

	// Pre-compute approval requirements for O(1) lookup during execution
	approvalMap := make(map[string]*arkv1alpha1.ToolApprovalConfig)
	for _, tool := range crd.Spec.Tools {
		if tool.Approval != nil && tool.Approval.Required {
			approvalMap[tool.Name] = tool.Approval
		}
	}

	return &Agent{
		Name:                  crd.Name,
		Namespace:             crd.Namespace,
		Prompt:                crd.Spec.Prompt,
		Description:           crd.Spec.Description,
		Parameters:            crd.Spec.Parameters,
		Model:                 resolvedModel,
		Tools:                 tools,
		telemetryRecorder:     telemetryProvider.AgentRecorder(),
		eventingRecorder:      eventingProvider.AgentRecorder(),
		eventing:              eventingProvider,
		ExecutionEngine:       crd.Spec.ExecutionEngine,
		Annotations:           crd.Annotations,
		OutputSchema:          crd.Spec.OutputSchema,
		client:                k8sClient,
		approvalRequiredTools: approvalMap,
	}, nil
}

// reconstructMessagesForResumption fetches memory messages and appends tool call and results
func (a *Agent) reconstructMessagesForResumption(
	ctx context.Context,
	toolCalls []openai.ChatCompletionMessageToolCall,
	approvedResults []ToolResult,
	memory MemoryInterface,
	originalInput []Message,
) ([]Message, []Message, error) {
	log := logf.FromContext(ctx)

	// Get existing messages from memory
	agentMessages, err := memory.GetMessages(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to fetch conversation history: %w", err)
	}

	// If memory is empty, use the original input to provide context
	if len(agentMessages) == 0 && len(originalInput) > 0 {
		log.Info("Memory returned no messages, using original input for context", "inputCount", len(originalInput))
		agentMessages = originalInput
	}

	log.Info("Fetched messages from memory for resumption", "count", len(agentMessages))

	// Reconstruct the assistant message with tool_calls that triggered the approval
	assistantMsg := openai.ChatCompletionMessage{
		Role:      constant.Assistant("assistant"),
		ToolCalls: toolCalls,
	}
	assistantMsgConverted := Message(assistantMsg.ToParam())
	agentMessages = append(agentMessages, assistantMsgConverted)

	// Append tool results as tool messages
	toolResultMessages := []Message{}
	for _, result := range approvedResults {
		content := result.Content
		if result.Error != "" {
			content = result.Error
		}
		toolMsg := ToolMessage(content, result.ID)
		agentMessages = append(agentMessages, toolMsg)
		toolResultMessages = append(toolResultMessages, toolMsg)
	}

	log.Info("Reconstructed conversation for resumption", "totalMessages", len(agentMessages), "toolResults", len(approvedResults))

	// newMessages should contain the reconstructed messages so they get saved to memory
	newMessages := []Message{assistantMsgConverted}
	newMessages = append(newMessages, toolResultMessages...)
	log.Info("Starting resumption with reconstructed messages in newMessages", "count", len(newMessages))

	return agentMessages, newMessages, nil
}

// runAgenticLoopFromResumption continues the agentic loop after approval resumption
func (a *Agent) runAgenticLoopFromResumption(
	ctx context.Context,
	agentMessages []Message,
	newMessages []Message,
	eventStream EventStreamInterface,
	tools []openai.ChatCompletionToolParam,
) (*ExecutionResult, error) {
	for {
		if ctx.Err() != nil {
			return &ExecutionResult{Messages: newMessages}, ctx.Err()
		}

		response, err := a.executeModelCall(ctx, agentMessages, eventStream, tools, ToolChoiceUnset)
		if err != nil {
			return nil, err
		}

		choice := response.Choices[0]
		assistantMessage := a.processAssistantMessage(choice)

		agentMessages = append(agentMessages, assistantMessage)
		newMessages = append(newMessages, assistantMessage)

		if len(choice.Message.ToolCalls) == 0 {
			return &ExecutionResult{Messages: newMessages}, nil
		}

		if err := a.executeToolCalls(ctx, choice.Message.ToolCalls, &agentMessages, &newMessages); err != nil {
			newMessages = a.handleResumptionToolError(ctx, err, newMessages)
			return &ExecutionResult{Messages: newMessages}, err
		}
	}
}

// handleResumptionToolError logs a genuine tool failure and, for a cascading
// approval, drops the trailing assistant message whose tool_calls were not run.
func (a *Agent) handleResumptionToolError(ctx context.Context, err error, newMessages []Message) []Message {
	logger := logf.FromContext(ctx)
	if !IsTerminateTeam(err) && !IsSelectionMade(err) {
		logger.Error(err, "Tool execution failed during approval resumption", "agent", a.FullName())
	}

	var approvalErr *ApprovalRequiredError
	if errors.As(err, &approvalErr) && len(newMessages) > 0 {
		logger.Info("Removing last assistant message with pending tool_calls from result", "messageCount", len(newMessages))
		newMessages = newMessages[:len(newMessages)-1]
	}
	return newMessages
}
