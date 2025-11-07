package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/telemetry"
)

type Agent struct {
	Name            string
	Namespace       string
	Prompt          string
	Description     string
	Parameters      []arkv1alpha1.Parameter
	Model           *Model
	Tools           *ToolRegistry
	Recorder        EventEmitter
	AgentRecorder   telemetry.AgentRecorder
	ExecutionEngine *arkv1alpha1.ExecutionEngineRef
	Annotations     map[string]string
	OutputSchema    *runtime.RawExtension
	client          client.Client
}

// FullName returns the namespace/name format for the agent
func (a *Agent) FullName() string {
	return a.Namespace + "/" + a.Name
}

// Execute executes the agent with optional event emission for tool calls
func (a *Agent) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) ([]Message, error) {
	modelName := ""
	if a.Model != nil {
		modelName = a.Model.Model
	}

	agentTracker := NewOperationTracker(a.Recorder, ctx, "AgentExecution", a.FullName(), map[string]string{
		"model":     modelName,
		"queryId":   getQueryID(ctx),
		"sessionId": getSessionID(ctx),
		"agentName": a.FullName(),
		"namespace": a.Namespace,
	})
	defer agentTracker.Complete("")

	ctx, span := a.AgentRecorder.StartAgentExecution(ctx, a.Name, a.Namespace)
	defer span.End()

	var messages []Message
	var err error

	if a.ExecutionEngine != nil {
		// Check if this is the reserved 'a2a' execution engine
		if a.ExecutionEngine.Name == ExecutionEngineA2A {
			messages, err = a.executeWithA2AExecutionEngine(ctx, userInput, eventStream)
		} else {
			messages, err = a.executeWithExecutionEngine(ctx, userInput, history)
		}
	} else {
		// Regular agents require a model
		if a.Model == nil {
			err = fmt.Errorf("agent %s has no model configured", a.FullName())
			a.AgentRecorder.RecordError(span, err)
			return nil, err
		}

		messages, err = a.executeLocally(ctx, userInput, history, memory, eventStream)
	}

	if err != nil {
		a.AgentRecorder.RecordError(span, err)
		return messages, err
	}

	a.AgentRecorder.RecordSuccess(span)
	return messages, nil
}

func (a *Agent) executeWithExecutionEngine(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	engineClient := NewExecutionEngineClient(a.client)

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

	return engineClient.Execute(ctx, a.ExecutionEngine, agentConfig, userInput, history, toolDefinitions, a.Recorder)
}

func (a *Agent) executeWithA2AExecutionEngine(ctx context.Context, userInput Message, eventStream EventStreamInterface) ([]Message, error) {
	a2aEngine := NewA2AExecutionEngine(a.client, a.Recorder)
	return a2aEngine.Execute(ctx, a.Name, a.Namespace, a.Annotations, userInput, eventStream)
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
	llmTracker := NewOperationTracker(a.Recorder, ctx, "LLMCall", a.Model.Model, map[string]string{
		"agent": a.FullName(),
		"model": a.Model.Model,
	})

	// Set schema information on the model
	a.Model.OutputSchema = a.OutputSchema
	// Truncate schema name to 64 chars for OpenAI API compatibility - name is purely an identifier
	a.Model.SchemaName = fmt.Sprintf("%.64s", fmt.Sprintf("namespace-%s-agent-%s", a.Namespace, a.Name))

	response, err := a.Model.ChatCompletion(ctx, agentMessages, eventStream, 1, tools)
	if err != nil {
		llmTracker.Fail(err)
		return nil, fmt.Errorf("agent %s execution failed: %w", a.FullName(), err)
	}

	tokenUsage := TokenUsage{
		PromptTokens:     response.Usage.PromptTokens,
		CompletionTokens: response.Usage.CompletionTokens,
		TotalTokens:      response.Usage.TotalTokens,
	}
	llmTracker.CompleteWithTokens(tokenUsage)

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
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &params); err != nil {
		params = map[string]interface{}{"_raw": toolCall.Function.Arguments}
	}

	toolTracker := NewOperationTracker(a.Recorder, ctx, "ToolCall", toolCall.Function.Name, map[string]string{
		"toolId":     toolCall.ID,
		"toolName":   toolCall.Function.Name,
		"agentName":  a.FullName(),
		"queryId":    getQueryID(ctx),
		"sessionId":  getSessionID(ctx),
		"parameters": toolCall.Function.Arguments,
		"paramCount": fmt.Sprintf("%d", len(params)),
		"toolType":   a.Tools.GetToolType(toolCall.Function.Name),
	})

	result, err := a.Tools.ExecuteTool(ctx, ToolCall(toolCall), a.Recorder)
	toolMessage := ToolMessage(result.Content, result.ID)

	if err != nil {
		if IsTerminateTeam(err) {
			toolTracker.CompleteWithTermination(err.Error())
		} else {
			toolTracker.Fail(err)
		}
		return toolMessage, err
	}

	toolTracker.CompleteWithMetadata(result.Content, map[string]string{
		"resultLength": fmt.Sprintf("%d", len(result.Content)),
		"hasError":     "false",
		"resultId":     result.ID,
	})
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
			logger.Error(err, "Tool execution failed", "agent", a.FullName())
			return newMessages, err
		}
	}
}

func (a *Agent) GetName() string {
	return a.Name
}

func (a *Agent) GetType() string {
	return "agent"
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

func MakeAgent(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Agent, eventRecorder EventEmitter, telemetryProvider telemetry.Provider) (*Agent, error) {
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
		resolvedModel, err = LoadModel(ctx, k8sClient, crd.Spec.ModelRef, crd.Namespace, modelHeaders, telemetryProvider.ModelRecorder())
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

	tools := NewToolRegistry(mcpSettings, telemetryProvider.ToolRecorder())

	if err := tools.registerTools(ctx, k8sClient, crd, telemetryProvider); err != nil {
		return nil, err
	}

	return &Agent{
		Name:            crd.Name,
		Namespace:       crd.Namespace,
		Prompt:          crd.Spec.Prompt,
		Description:     crd.Spec.Description,
		Parameters:      crd.Spec.Parameters,
		Model:           resolvedModel,
		Tools:           tools,
		Recorder:        eventRecorder,
		AgentRecorder:   telemetryProvider.AgentRecorder(),
		ExecutionEngine: crd.Spec.ExecutionEngine,
		Annotations:     crd.Annotations,
		OutputSchema:    crd.Spec.OutputSchema,
		client:          k8sClient,
	}, nil
}
