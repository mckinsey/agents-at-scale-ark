package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
)

// ExecutionEngineMessage represents a chat message in the format expected by execution engines
type ExecutionEngineMessage struct {
	Role         string                                       `json:"role"`
	Content      string                                       `json:"content"`
	ContentParts []openai.ChatCompletionContentPartUnionParam `json:"contentParts,omitempty"`
	Name         string                                       `json:"name,omitempty"`
}

// ExecutionEngineRequest represents the data sent to an external execution engine
type ExecutionEngineRequest struct {
	// Agent configuration
	Agent AgentConfig `json:"agent"`
	// Current message to process
	UserInput *ExecutionEngineMessage `json:"userInput,omitempty"`
	// Conversation history
	History []ExecutionEngineMessage `json:"history,omitempty"`
	// Available tools
	Tools []ToolDefinition `json:"tools,omitempty"`
	// Payload mode indicates compat or native request format
	PayloadMode string `json:"payloadMode,omitempty"`
	// Native A2A user input
	A2AUserInput *protocol.Message `json:"a2aUserInput,omitempty"`
	// Native A2A conversation history
	A2AHistory []protocol.Message `json:"a2aHistory,omitempty"`
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
	Messages    []ExecutionEngineMessage `json:"messages"`
	A2AMessages []protocol.Message       `json:"a2aMessages,omitempty"`
	Error       string                   `json:"error,omitempty"`
	TokenUsage  TokenUsage               `json:"token_usage,omitempty"`
}

// convertToExecutionEngineMessage converts internal genai.Message to ExecutionEngineMessage format
func convertToExecutionEngineMessage(msg Message) ExecutionEngineMessage {
	role := resolveMessageRole(msg)
	content := ExtractTextFromMessage(msg)
	return ExecutionEngineMessage{
		Role:    role,
		Content: content,
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
		return ToolMessage(msg.Content, "")
	default:
		return NewUserMessage(msg.Content)
	}
}

func extractExecutionEngineMessageText(parts []openai.ChatCompletionContentPartUnionParam) string {
	var text string
	for _, part := range parts {
		if part.OfText != nil {
			text += part.OfText.Text
		}
	}
	return text
}

func convertFromExecutionEngineMessageExperimental(msg ExecutionEngineMessage) Message {
	content := msg.Content
	if content == "" && len(msg.ContentParts) > 0 {
		content = extractExecutionEngineMessageText(msg.ContentParts)
	}

	if msg.Role == RoleUser && len(msg.ContentParts) > 0 {
		return openai.UserMessage(msg.ContentParts)
	}

	switch msg.Role {
	case RoleUser:
		return NewUserMessage(content)
	case RoleAssistant:
		return NewAssistantMessage(content)
	case RoleSystem:
		return NewSystemMessage(content)
	case RoleTool:
		return ToolMessage(content, "")
	default:
		return NewUserMessage(content)
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

	engineAddress, _, err := c.resolveExecutionEngineAddress(ctx, engineRef, agentConfig.Namespace)
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
		Agent:       agentConfig,
		UserInput:   &convertedUserInput,
		History:     convertedHistory,
		Tools:       tools,
		PayloadMode: A2APayloadModeCompat,
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to marshal request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	executeURL, err := resolveExecutionEngineURL(engineAddress, "/execute")
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine URL: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, executeURL, bytes.NewBuffer(requestBody))
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

//nolint:gocognit // Mirrors Execute with A2A payload handling; cohesive HTTP request/response flow
func (c *ExecutionEngineClient) ExecuteA2A(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, agentConfig AgentConfig, userInput protocol.Message, history []protocol.Message, tools []ToolDefinition) ([]protocol.Message, error) {
	operationData := map[string]string{
		"engineName": engineRef.Name,
		"agentName":  agentConfig.Name,
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Executing agent via execution engine %s", engineRef.Name), operationData)

	engineAddress, engineType, err := c.resolveExecutionEngineAddress(ctx, engineRef, agentConfig.Namespace)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine address: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine address: %w", err)
	}

	request := ExecutionEngineRequest{
		Agent:        agentConfig,
		Tools:        tools,
		PayloadMode:  A2APayloadModeNative,
		A2AUserInput: &userInput,
		A2AHistory:   history,
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to marshal request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	executionPath := "/execute"
	if _, ok := knownA2ANativeExecutionEngineTypes[engineType]; ok {
		executionPath = "/execute-a2a"
	}
	executeURL, err := resolveExecutionEngineURL(engineAddress, executionPath)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine URL: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, executeURL, bytes.NewBuffer(requestBody))
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

	if len(response.A2AMessages) > 0 {
		c.eventingRecorder.Complete(ctx, "ExecutionEngine", "Execution engine completed successfully", operationData)
		return response.A2AMessages, nil
	}

	convertedMessages := make([]protocol.Message, 0, len(response.Messages))
	contextID := GetA2AContextID(ctx)
	queryID := getQueryID(ctx)
	for i := range response.Messages {
		compatMessage := convertFromExecutionEngineMessageExperimental(response.Messages[i])
		converted, convErr := convertCompatMessageToA2A(compatMessage)
		if convErr != nil {
			return nil, fmt.Errorf("failed to convert execution engine response message %d to A2A: %w", i, convErr)
		}
		if converted.ContextID == nil && contextID != "" {
			contextIDCopy := contextID
			converted.ContextID = &contextIDCopy
		}
		if converted.TaskID == nil && queryID != "" {
			queryIDCopy := queryID
			converted.TaskID = &queryIDCopy
		}
		convertedMessages = append(convertedMessages, converted)
	}
	if len(convertedMessages) == 0 {
		err := fmt.Errorf("execution engine %s returned no messages for native A2A execution", engineRef.Name)
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", err.Error(), err, operationData)
		return nil, err
	}

	c.eventingRecorder.Complete(ctx, "ExecutionEngine", "Execution engine completed successfully", operationData)
	return convertedMessages, nil
}

// resolveExecutionEngineAddress resolves the address of the execution engine
func (c *ExecutionEngineClient) resolveExecutionEngineAddress(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, defaultNamespace string) (string, string, error) {
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
		return "", "", fmt.Errorf("execution engine %s not found in namespace %s: %w", engineName, namespace, err)
	}

	// Check if address is resolved in status
	if engineCRD.Status.LastResolvedAddress == "" {
		return "", "", fmt.Errorf("execution engine %s address not yet resolved", engineName)
	}

	return engineCRD.Status.LastResolvedAddress, normalizeExecutionEngineType(engineCRD.Spec.Type), nil
}

func resolveExecutionEngineURL(engineAddress, fallbackPath string) (string, error) {
	parsedURL, err := url.Parse(engineAddress)
	if err != nil {
		return "", err
	}
	if parsedURL.Path == "" || parsedURL.Path == "/" {
		parsedURL.Path = fallbackPath
	}
	return parsedURL.String(), nil
}

// buildAgentConfig creates an AgentConfig from the agent and model data
func buildAgentConfig(agent *Agent) AgentConfig {
	model := ExecutionEngineModel{}
	if agent.Model != nil {
		model = ExecutionEngineModel{
			Name:   agent.Model.Model,
			Type:   agent.Model.Type,
			Config: buildModelConfig(agent.Model),
		}
	}

	parameters := buildParameters(agent.Parameters)

	return AgentConfig{
		Name:         agent.Name,
		Namespace:    agent.Namespace,
		Prompt:       agent.Prompt,
		Description:  agent.Description,
		Parameters:   parameters,
		Model:        model,
		OutputSchema: agent.OutputSchema,
	}
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
