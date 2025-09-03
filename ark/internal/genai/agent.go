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

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
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
func (a *Agent) Execute(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	if a.Model == nil {
		return nil, fmt.Errorf("agent %s has no model configured", a.FullName())
	}

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

	if a.ExecutionEngine != nil {
		// Check if this is the reserved 'a2a' execution engine
		if a.ExecutionEngine.Name == "a2a" {
			return a.executeWithA2AExecutionEngine(ctx, userInput)
		}
		return a.executeWithExecutionEngine(ctx, userInput, history)
	}

	return a.executeLocally(ctx, userInput, history)
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

func (a *Agent) executeWithA2AExecutionEngine(ctx context.Context, userInput Message) ([]Message, error) {
	a2aEngine := NewA2AExecutionEngine(a.client, a.Recorder)
	return a2aEngine.Execute(ctx, a.Name, a.Namespace, a.Annotations, userInput)
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

func (a *Agent) executeModelCall(ctx context.Context, agentMessages []Message, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	llmTracker := NewOperationTracker(a.Recorder, ctx, "LLMCall", a.Model.Model, map[string]string{
		"agent": a.FullName(),
		"model": a.Model.Model,
	})

	// Set schema information on the model
	a.Model.OutputSchema = a.OutputSchema
	// Truncate schema name to 64 chars for OpenAI API compatibility - name is purely an identifier
	a.Model.SchemaName = fmt.Sprintf("%.64s", fmt.Sprintf("namespace-%s-agent-%s", a.Namespace, a.Name))

	response, err := a.Model.ChatCompletion(ctx, agentMessages, tools)
	if err != nil {
		llmTracker.Fail(err)
		return nil, fmt.Errorf("agent %s execution failed: %w", a.FullName(), err)
	}

	tokenUsage := TokenUsage{
		PromptTokens:     response.Usage.PromptTokens,
		CompletionTokens: response.Usage.CompletionTokens,
		TotalTokens:      response.Usage.TotalTokens,
	}
	llmTracker.CompleteWithTokens("", tokenUsage)

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
func (a *Agent) executeLocally(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
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

		response, err := a.executeModelCall(ctx, agentMessages, tools)
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
	if engineName == "a2a" {
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

func MakeAgent(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Agent, eventRecorder EventEmitter) (*Agent, error) {
	// Load model with automatic resolution
	resolvedModel, err := LoadModel(ctx, k8sClient, crd.Spec.ModelRef, crd.Namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to load model for agent %s/%s: %w", crd.Namespace, crd.Name, err)
	}

	// Validate ExecutionEngine if specified
	if crd.Spec.ExecutionEngine != nil {
		err := ValidateExecutionEngine(ctx, k8sClient, crd.Spec.ExecutionEngine, crd.Namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to validate execution engine %s for agent %s/%s: %w",
				crd.Spec.ExecutionEngine.Name, crd.Namespace, crd.Name, err)
		}
	}

	tools := NewToolRegistry()

	if err := tools.registerTools(ctx, k8sClient, crd); err != nil {
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
		ExecutionEngine: crd.Spec.ExecutionEngine,
		Annotations:     crd.Annotations,
		OutputSchema:    crd.Spec.OutputSchema,
		client:          k8sClient,
	}, nil
}
