package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
)

// ExecutionEngineMessage represents a chat message in the format expected by execution engines
type ExecutionEngineMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

// ExecutionEngineRequest represents the data sent to an external execution engine
type ExecutionEngineRequest struct {
	// Agent configuration
	Agent AgentConfig `json:"agent"`
	// Current message to process
	UserInput ExecutionEngineMessage `json:"userInput"`
	// Conversation history
	History []ExecutionEngineMessage `json:"history"`
	// Available tools
	Tools []ToolDefinition `json:"tools,omitempty"`
}

// AgentConfig contains agent configuration for the execution engine
type AgentConfig struct {
	Name         string                `json:"name"`
	Namespace    string                `json:"namespace"`
	Prompt       string                `json:"prompt"`
	Description  string                `json:"description"`
	Parameters   []Parameter           `json:"parameters,omitempty"`
	Model        ExecutionEngineModel  `json:"model"`
	OutputSchema *runtime.RawExtension `json:"outputSchema,omitempty"`
}

// ExecutionEngineModel contains model configuration for the execution engine
type ExecutionEngineModel struct {
	Name   string         `json:"name"`
	Type   string         `json:"type"`
	Config map[string]any `json:"config,omitempty"`
}

// Parameter represents a parameter for template processing
type Parameter struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// TokenUsage represents token usage statistics from an execution engine
type TokenUsage struct {
	PromptTokens     int64 `json:"prompt_tokens,omitempty"`
	CompletionTokens int64 `json:"completion_tokens,omitempty"`
	TotalTokens      int64 `json:"total_tokens,omitempty"`
}

// ExecutionEngineResponse represents the response from an external execution engine
type ExecutionEngineResponse struct {
	Messages   []ExecutionEngineMessage `json:"messages"`
	Error      string                   `json:"error,omitempty"`
	TokenUsage TokenUsage               `json:"token_usage,omitempty"`
}

// convertToExecutionEngineMessage converts internal genai.Message to ExecutionEngineMessage format
func convertToExecutionEngineMessage(msg Message) ExecutionEngineMessage {
	// Handle different message types from OpenAI ChatCompletionMessageParamUnion
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

	// Fallback for unknown message types
	return ExecutionEngineMessage{
		Role:    "user",
		Content: "",
	}
}

// convertFromExecutionEngineMessage converts ExecutionEngineMessage back to internal genai.Message format
func convertFromExecutionEngineMessage(msg ExecutionEngineMessage) Message {
	switch msg.Role {
	case RoleUser:
		return NewUserMessage(msg.Content)
	case RoleAssistant:
		return NewAssistantMessage(msg.Content)
	case RoleSystem:
		return NewSystemMessage(msg.Content)
	case RoleTool:
		// For tool messages, we need a tool call ID, but execution engines don't provide it
		// So we'll convert to assistant message for now
		return NewAssistantMessage(msg.Content)
	default:
		// Default to user message for unknown roles
		return NewUserMessage(msg.Content)
	}
}

// ExecutionEngineClient handles communication with external execution engines
type ExecutionEngineClient struct {
	client           client.Client
	httpClient       *http.Client
	eventingRecorder eventing.ExecutionEngineRecorder
}

// NewExecutionEngineClient creates a new ExecutionEngine client
func NewExecutionEngineClient(k8sClient client.Client, eventingRecorder eventing.ExecutionEngineRecorder) *ExecutionEngineClient {
	return &ExecutionEngineClient{
		client:           k8sClient,
		eventingRecorder: eventingRecorder,
		httpClient: &http.Client{
			Timeout: 300 * time.Second, // 5 minutes timeout for agent execution
		},
	}
}

// Execute sends a request to the execution engine and returns the response messages
func (c *ExecutionEngineClient) Execute(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, agentConfig AgentConfig, userInput Message, history []Message, tools []ToolDefinition) ([]Message, error) {
	operationData := map[string]string{
		"engineName": engineRef.Name,
		"agentName":  agentConfig.Name,
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Executing agent via execution engine %s", engineRef.Name), operationData)

	engineAddress, err := c.resolveExecutionEngineAddress(ctx, engineRef, agentConfig.Namespace)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine address: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine address: %w", err)
	}

	// Convert messages to execution engine format
	convertedUserInput := convertToExecutionEngineMessage(userInput)
	convertedHistory := make([]ExecutionEngineMessage, len(history))
	for i, msg := range history {
		convertedHistory[i] = convertToExecutionEngineMessage(msg)
	}

	request := ExecutionEngineRequest{
		Agent:     agentConfig,
		UserInput: convertedUserInput,
		History:   convertedHistory,
		Tools:     tools,
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to marshal request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/execute", engineAddress)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(requestBody))
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to create request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Execution engine request failed: %v", err), err, operationData)
		return nil, fmt.Errorf("execution engine request failed: %w", err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.Log.Error(closeErr, "failed to close response body")
		}
	}()

	if resp.StatusCode != http.StatusOK {
		err := fmt.Errorf("execution engine returned error status: %d", resp.StatusCode)
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", err.Error(), err, operationData)
		return nil, err
	}

	var response ExecutionEngineResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to decode response: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if response.Error != "" {
		err := fmt.Errorf("execution engine error: %s", response.Error)
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", err.Error(), err, operationData)
		return nil, err
	}

	// Convert response messages back to internal format
	convertedMessages := make([]Message, len(response.Messages))
	for i, msg := range response.Messages {
		convertedMessages[i] = convertFromExecutionEngineMessage(msg)
	}

	c.eventingRecorder.Complete(ctx, "ExecutionEngine", "Execution engine completed successfully", operationData)
	return convertedMessages, nil
}

// resolveExecutionEngineAddress resolves the address of the execution engine
func (c *ExecutionEngineClient) resolveExecutionEngineAddress(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, defaultNamespace string) (string, error) {
	// Resolve execution engine name and namespace
	engineName := engineRef.Name
	namespace := engineRef.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	// Get ExecutionEngine CRD
	var engineCRD arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: engineName, Namespace: namespace}
	if err := c.client.Get(ctx, engineKey, &engineCRD); err != nil {
		return "", fmt.Errorf("execution engine %s not found in namespace %s: %w", engineName, namespace, err)
	}

	// Check if address is resolved in status
	if engineCRD.Status.LastResolvedAddress == "" {
		return "", fmt.Errorf("execution engine %s address not yet resolved", engineName)
	}

	return engineCRD.Status.LastResolvedAddress, nil
}

// buildAgentConfig creates an AgentConfig from the agent and model data
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
			Type:   agent.Model.Type,
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

func buildModelConfig(model *Model) map[string]any {
	modelConfig := make(map[string]any)

	if configProvider, ok := model.Provider.(ConfigProvider); ok {
		switch model.Type {
		case ModelTypeAzure:
			modelConfig["azure"] = configProvider.BuildConfig()
		case ModelTypeOpenAI:
			modelConfig["openai"] = configProvider.BuildConfig()
		case ModelTypeBedrock:
			modelConfig["bedrock"] = configProvider.BuildConfig()
		}
	}

	return modelConfig
}

// buildToolDefinitions converts ToolRegistry to tool definitions for the execution engine
func buildToolDefinitions(tools *ToolRegistry) []ToolDefinition {
	if tools == nil {
		return nil
	}

	// Simply return the existing tool definitions from the registry
	return tools.GetToolDefinitions()
}
