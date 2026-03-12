package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
)

const ArkMetadataKey = "ark.mckinsey.com/execution-engine"

type ExecutionEngineMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

type AgentConfig struct {
	Name         string                `json:"name"`
	Namespace    string                `json:"namespace"`
	Prompt       string                `json:"prompt"`
	Description  string                `json:"description"`
	Parameters   []Parameter           `json:"parameters,omitempty"`
	Model        ExecutionEngineModel  `json:"model"`
	OutputSchema *runtime.RawExtension `json:"outputSchema,omitempty"`
	Labels       map[string]string     `json:"labels,omitempty"`
}

type ExecutionEngineModel struct {
	Name   string         `json:"name"`
	Type   string         `json:"type"`
	Config map[string]any `json:"config,omitempty"`
}

type Parameter struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type TokenUsage struct {
	PromptTokens     int64 `json:"prompt_tokens,omitempty"`
	CompletionTokens int64 `json:"completion_tokens,omitempty"`
	TotalTokens      int64 `json:"total_tokens,omitempty"`
}

type ExecutionEngineA2AClient struct {
	client           client.Client
	eventingRecorder eventing.ExecutionEngineRecorder
}

func NewExecutionEngineA2AClient(k8sClient client.Client, eventingRecorder eventing.ExecutionEngineRecorder) *ExecutionEngineA2AClient {
	return &ExecutionEngineA2AClient{
		client:           k8sClient,
		eventingRecorder: eventingRecorder,
	}
}

func (c *ExecutionEngineA2AClient) Execute(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, agentConfig AgentConfig, userInput Message, history []Message, tools []ToolDefinition) ([]Message, error) {
	operationData := map[string]string{
		"engineName": engineRef.Name,
		"agentName":  agentConfig.Name,
		"protocol":   "a2a",
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Executing agent via A2A execution engine %s", engineRef.Name), operationData)

	engineAddress, err := c.resolveExecutionEngineAddress(ctx, engineRef, agentConfig.Namespace)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine: %w", err)
	}

	content := ""
	if userInput.OfUser != nil && userInput.OfUser.Content.OfString.Value != "" {
		content = userInput.OfUser.Content.OfString.Value
	}

	historyMessages := make([]ExecutionEngineMessage, 0, len(history))
	for _, msg := range history {
		historyMessages = append(historyMessages, convertToExecutionEngineMessage(msg))
	}

	toolDefs := make([]map[string]any, 0, len(tools))
	for _, t := range tools {
		td := map[string]any{
			"name":        t.Name,
			"description": t.Description,
		}
		if t.Parameters != nil {
			td["parameters"] = t.Parameters
		}
		toolDefs = append(toolDefs, td)
	}

	arkMetadata := map[string]any{
		"agent":   agentConfig,
		"tools":   toolDefs,
		"history": historyMessages,
	}

	metadataBytes, err := json.Marshal(map[string]any{
		ArkMetadataKey: arkMetadata,
	})
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to marshal metadata: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to marshal A2A metadata: %w", err)
	}

	var metadata map[string]any
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return nil, fmt.Errorf("failed to prepare A2A metadata: %w", err)
	}

	message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart(content),
	})
	message.Metadata = metadata

	a2aClient, err := CreateA2AClient(ctx, c.client, engineAddress, nil, agentConfig.Namespace, agentConfig.Name, nil)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to create A2A client: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to create A2A client: %w", err)
	}

	blocking := true
	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	}

	result, err := a2aClient.SendMessage(ctx, params)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
		return nil, fmt.Errorf("A2A execution engine call failed: %w", err)
	}

	responseText, err := extractResponseText(result)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to extract response: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to extract response from A2A result: %w", err)
	}

	c.eventingRecorder.Complete(ctx, "ExecutionEngine", "A2A execution engine completed successfully", operationData)
	return []Message{NewAssistantMessage(responseText)}, nil
}

func extractResponseText(result *protocol.MessageResult) (string, error) {
	if result == nil {
		return "", fmt.Errorf("nil result from A2A server")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		return ExtractTextFromParts(r.Parts), nil
	case *protocol.Task:
		text, err := extractTextFromTask(r)
		if err != nil {
			return "", err
		}
		return text, nil
	default:
		return "", fmt.Errorf("unexpected A2A result type: %T", result.Result)
	}
}

func (c *ExecutionEngineA2AClient) resolveExecutionEngineAddress(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, defaultNamespace string) (string, error) {
	engineName := engineRef.Name
	namespace := engineRef.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	var engineCRD arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: engineName, Namespace: namespace}
	if err := c.client.Get(ctx, engineKey, &engineCRD); err != nil {
		return "", fmt.Errorf("execution engine %s not found in namespace %s: %w", engineName, namespace, err)
	}

	if engineCRD.Status.LastResolvedAddress == "" {
		return "", fmt.Errorf("execution engine %s address not yet resolved", engineName)
	}

	return engineCRD.Status.LastResolvedAddress, nil
}

func convertToExecutionEngineMessage(msg Message) ExecutionEngineMessage {
	if msg.OfUser != nil {
		content := ""
		if msg.OfUser.Content.OfString.Value != "" {
			content = msg.OfUser.Content.OfString.Value
		}
		return ExecutionEngineMessage{
			Role:    "user",
			Content: content,
		}
	}
	if msg.OfAssistant != nil {
		content := ""
		if msg.OfAssistant.Content.OfString.Value != "" {
			content = msg.OfAssistant.Content.OfString.Value
		}
		return ExecutionEngineMessage{
			Role:    "assistant",
			Content: content,
		}
	}
	if msg.OfSystem != nil {
		content := ""
		if msg.OfSystem.Content.OfString.Value != "" {
			content = msg.OfSystem.Content.OfString.Value
		}
		return ExecutionEngineMessage{
			Role:    "system",
			Content: content,
		}
	}
	if msg.OfTool != nil {
		content := ""
		if msg.OfTool.Content.OfString.Value != "" {
			content = msg.OfTool.Content.OfString.Value
		}
		return ExecutionEngineMessage{
			Role:    "tool",
			Content: content,
		}
	}

	return ExecutionEngineMessage{
		Role:    "user",
		Content: "",
	}
}

func buildAgentConfig(agent *Agent) (AgentConfig, error) {
	if agent.Model == nil {
		return AgentConfig{}, fmt.Errorf("agent %s has no model configured", agent.FullName())
	}

	parameters := buildParameters(agent.Parameters)
	modelConfig := buildModelConfig(agent.Model)

	return AgentConfig{
		Name:        agent.Name,
		Namespace:   agent.Namespace,
		Prompt:      agent.Prompt,
		Description: agent.Description,
		Parameters:  parameters,
		Model: ExecutionEngineModel{
			Name:   agent.Model.Model,
			Type:   detectProviderName(agent.Model),
			Config: modelConfig,
		},
		OutputSchema: agent.OutputSchema,
	}, nil
}

func buildParameters(agentParams []arkv1alpha1.Parameter) []Parameter {
	var parameters []Parameter
	for _, param := range agentParams {
		if param.Value != "" {
			parameters = append(parameters, Parameter{
				Name:  param.Name,
				Value: param.Value,
			})
		}
	}
	return parameters
}

func detectProviderName(model *Model) string {
	switch model.Provider.(type) {
	case *AzureProvider:
		return ProviderAzure
	case *OpenAIProvider:
		return ProviderOpenAI
	case *BedrockModel:
		return ProviderBedrock
	}
	return model.Type
}

func buildModelConfig(model *Model) map[string]any {
	modelConfig := make(map[string]any)

	if configProvider, ok := model.Provider.(ConfigProvider); ok {
		provider := detectProviderName(model)
		modelConfig[provider] = configProvider.BuildConfig()
	}

	return modelConfig
}

func buildToolDefinitions(tools *ToolRegistry) []ToolDefinition {
	if tools == nil {
		return nil
	}

	return tools.GetToolDefinitions()
}
