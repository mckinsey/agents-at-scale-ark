package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

type Agent struct {
	Name              string
	Namespace         string
	Prompt            string
	Description       string
	Parameters        []arkv1alpha1.Parameter
	Model             *Model
	Tools             *ToolRegistry
	telemetryRecorder telemetry.AgentRecorder
	eventingRecorder  eventing.AgentRecorder
	eventing          eventing.Provider
	ExecutionEngine   *arkv1alpha1.ExecutionEngineRef
	Annotations       map[string]string
	OutputSchema      *runtime.RawExtension
	client            client.Client
}

// FullName returns the namespace/name format for the agent
func (a *Agent) FullName() string {
	return a.Namespace + "/" + a.Name
}

// Execute executes the agent with optional event emission for tool calls
func (a *Agent) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	ctx, span := a.telemetryRecorder.StartAgentExecution(ctx, a.Name, a.Namespace)
	defer span.End()

	operationData := map[string]string{
		"agent": a.FullName(),
	}
	ctx = a.eventingRecorder.Start(ctx, "AgentExecution", fmt.Sprintf("Executing agent %s", a.FullName()), operationData)

	result, err := a.executeAgent(ctx, userInput, history, memory, eventStream)
	if err != nil {
		a.telemetryRecorder.RecordError(span, err)
		if !IsTerminateTeam(err) {
			a.eventingRecorder.Fail(ctx, "AgentExecution", fmt.Sprintf("Agent execution failed: %v", err), err, operationData)
		}
		return nil, err
	}

	a.telemetryRecorder.RecordSuccess(span)
	a.eventingRecorder.Complete(ctx, "AgentExecution", "Agent execution completed successfully", operationData)
	return result, nil
}

func (a *Agent) executeAgent(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if a.ExecutionEngine != nil {
		return a.executeWithExecutionEngineRouter(ctx, userInput, history, eventStream)
	}

	messages, err := a.executeLocally(ctx, userInput, history, memory, eventStream)
	if err != nil {
		return nil, err
	}
	return &ExecutionResult{Messages: messages}, nil
}

func (a *Agent) executeWithExecutionEngineRouter(ctx context.Context, userInput Message, history []Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if a.ExecutionEngine.Name == ExecutionEngineA2A {
		return a.executeWithA2AExecutionEngine(ctx, userInput, eventStream)
	}

	messages, err := a.executeWithExecutionEngine(ctx, userInput, history)
	if err != nil {
		return nil, err
	}
	return &ExecutionResult{Messages: messages}, nil
}

func (a *Agent) executeWithExecutionEngine(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	engineClient := NewExecutionEngineClient(a.client, a.eventing.ExecutionEngineRecorder())

	agentConfig, err := buildAgentConfig(a)
	if err != nil {
		return nil, fmt.Errorf("failed to build agent config: %w", err)
	}

	resolvedPrompt, err := a.resolvePrompt(ctx)
	if err != nil {
		return nil, fmt.Errorf("agent %s prompt resolution failed: %w", a.FullName(), err)
	}
	agentConfig.Prompt = resolvedPrompt

	toolDefinitions := buildToolDefinitions(a.Tools)

	return engineClient.Execute(ctx, a.ExecutionEngine, agentConfig, userInput, history, toolDefinitions)
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
func (a *Agent) executeModelCall(ctx context.Context, agentMessages []Message, tools []openai.ChatCompletionToolParam, eventStream EventStreamInterface) (*openai.ChatCompletion, error) {
	// Set schema information on the model
	a.Model.OutputSchema = a.OutputSchema
	// Truncate schema name to 64 chars for OpenAI API compatibility - name is purely an identifier
	a.Model.SchemaName = fmt.Sprintf("%.64s", fmt.Sprintf("namespace-%s-agent-%s", a.Namespace, a.Name))

	response, err := a.Model.ChatCompletion(ctx, agentMessages, eventStream, 1, tools)
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
		m.Name = param.Opt[string]{Value: a.Name}
	}

	return assistantMessage
}

func (a *Agent) executeToolCall(ctx context.Context, toolCall openai.ChatCompletionMessageToolCall) (Message, error) {
	result, err := a.Tools.ExecuteTool(ctx, ToolCall(toolCall))
	toolMessage := ToolMessage(result.Content, result.ID)

	if err != nil {
		return toolMessage, err
	}

	return toolMessage, nil
}

func (a *Agent) executeToolCalls(ctx context.Context, toolCalls []openai.ChatCompletionMessageToolCall, agentMessages, newMessages *[]Message) error {
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
func (a *Agent) executeLocally(ctx context.Context, userInput Message, history []Message, _ MemoryInterface, eventStream EventStreamInterface) ([]Message, error) {
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

		response, err := a.executeModelCall(ctx, agentMessages, tools, eventStream)
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
			if !IsTerminateTeam(err) {
				logger.Error(err, "Tool execution failed", "agent", a.FullName())
			}
			return newMessages, err
		}
	}
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
	if engineName == ExecutionEngineA2A {
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

func resolveMCPSettingsForAgent(ctx context.Context, k8sClient client.Client, agentCRD *arkv1alpha1.Agent, queryCRD *arkv1alpha1.Query, queryMCPSettings map[string]MCPSettings) (map[string]MCPSettings, error) {
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
		mcpSettings = make(map[string]MCPSettings)
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
	if crd.Spec.ExecutionEngine == nil || crd.Spec.ExecutionEngine.Name != ExecutionEngineA2A {
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

	return &Agent{
		Name:              crd.Name,
		Namespace:         crd.Namespace,
		Prompt:            crd.Spec.Prompt,
		Description:       crd.Spec.Description,
		Parameters:        crd.Spec.Parameters,
		Model:             resolvedModel,
		Tools:             tools,
		telemetryRecorder: telemetryProvider.AgentRecorder(),
		eventingRecorder:  eventingProvider.AgentRecorder(),
		eventing:          eventingProvider,
		ExecutionEngine:   crd.Spec.ExecutionEngine,
		Annotations:       crd.Annotations,
		OutputSchema:      crd.Spec.OutputSchema,
		client:            k8sClient,
	}, nil
}
