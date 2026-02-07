package genai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/tokens"
)

// ExecutionEngineMessage represents a chat message in the format expected by execution engines
type ExecutionEngineMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

// WorkspaceConfig contains workspace configuration passed to execution engines
type WorkspaceConfig struct {
	Path           string `json:"path"`
	SessionId      string `json:"sessionId,omitempty"`
	Persistent     bool   `json:"persistent"`
	HasEnvironment bool   `json:"hasEnvironment"`
	HasGit         bool   `json:"hasGit"`
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
	// Workspace configuration
	Workspace *WorkspaceConfig `json:"workspace,omitempty"`
}

// AgentConfig contains agent configuration for the execution engine
type AgentConfig struct {
	Name         string                `json:"name"`
	Namespace    string                `json:"namespace"`
	Prompt       string                `json:"prompt"`
	Description  string                `json:"description"`
	Parameters   []Parameter           `json:"parameters,omitempty"`
	Model        ExecutionEngineModel  `json:"model"`
	Labels       map[string]string     `json:"labels,omitempty"`
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

const defaultExecutionEngineTimeout = 300 * time.Second

// ExecutionEngineClient handles communication with external execution engines
type ExecutionEngineClient struct {
	client           client.Client
	eventingRecorder eventing.ExecutionEngineRecorder
}

// NewExecutionEngineClient creates a new ExecutionEngine client
func NewExecutionEngineClient(k8sClient client.Client, eventingRecorder eventing.ExecutionEngineRecorder) *ExecutionEngineClient {
	return &ExecutionEngineClient{
		client:           k8sClient,
		eventingRecorder: eventingRecorder,
	}
}

func (c *ExecutionEngineClient) httpClientWithTimeout(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
	}
}

// resolvedEngine holds the resolved address and configuration from an ExecutionEngine CRD
type resolvedEngine struct {
	address   string
	timeout   time.Duration
	streaming bool
}

// resolveEngine fetches and resolves the full ExecutionEngine configuration
func (c *ExecutionEngineClient) resolveEngine(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, defaultNamespace string) (*resolvedEngine, error) {
	engineName := engineRef.Name
	namespace := engineRef.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	var engineCRD arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: engineName, Namespace: namespace}
	if err := c.client.Get(ctx, engineKey, &engineCRD); err != nil {
		return nil, fmt.Errorf("execution engine %s not found in namespace %s: %w", engineName, namespace, err)
	}

	if engineCRD.Status.LastResolvedAddress == "" {
		return nil, fmt.Errorf("execution engine %s address not yet resolved", engineName)
	}

	timeout := defaultExecutionEngineTimeout
	if engineCRD.Spec.Timeout != "" {
		parsed, err := time.ParseDuration(engineCRD.Spec.Timeout)
		if err != nil {
			logf.Log.Error(err, "invalid timeout on execution engine, using default", "engine", engineName, "timeout", engineCRD.Spec.Timeout)
		} else {
			timeout = parsed
		}
	}

	return &resolvedEngine{
		address:   engineCRD.Status.LastResolvedAddress,
		timeout:   timeout,
		streaming: engineCRD.Spec.Streaming,
	}, nil
}

// executeParams bundles the parameters for an execution engine call
type executeParams struct {
	engineRef   *arkv1alpha1.ExecutionEngineRef
	engine      *resolvedEngine
	agentConfig AgentConfig
	userInput   Message
	history     []Message
	tools       []ToolDefinition
	workspace   *WorkspaceConfig
}

// Execute resolves the engine and sends a request. Convenience wrapper around ExecuteWithEngine.
func (c *ExecutionEngineClient) Execute(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, agentConfig AgentConfig, userInput Message, history []Message, tools []ToolDefinition) ([]Message, error) {
	engine, err := c.resolveEngine(ctx, engineRef, agentConfig.Namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve execution engine: %w", err)
	}
	return c.ExecuteWithEngine(ctx, engineRef, engine, agentConfig, userInput, history, tools, nil)
}

// ExecuteWithEngine sends a request to the execution engine using a pre-resolved engine config
func (c *ExecutionEngineClient) ExecuteWithEngine(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, engine *resolvedEngine, agentConfig AgentConfig, userInput Message, history []Message, tools []ToolDefinition, workspace *WorkspaceConfig) ([]Message, error) {
	operationData := map[string]string{
		"engineName": engineRef.Name,
		"agentName":  agentConfig.Name,
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Executing agent via execution engine %s", engineRef.Name), operationData)

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
		Workspace: workspace,
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to marshal request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	executeURL := fmt.Sprintf("%s/execute", engine.address)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, executeURL, bytes.NewBuffer(requestBody))
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to create request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	httpClient := c.httpClientWithTimeout(engine.timeout)
	resp, err := httpClient.Do(req)
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

	recordTokenUsage(ctx, response.TokenUsage)

	convertedMessages := make([]Message, len(response.Messages))
	for i, msg := range response.Messages {
		convertedMessages[i] = convertFromExecutionEngineMessage(msg)
	}

	c.eventingRecorder.Complete(ctx, "ExecutionEngine", "Execution engine completed successfully", operationData)
	return convertedMessages, nil
}

// buildRequestBody creates the JSON request body for an execution engine call
func buildRequestBody(agentConfig AgentConfig, userInput Message, history []Message, tools []ToolDefinition, workspace *WorkspaceConfig) ([]byte, error) {
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
		Workspace: workspace,
	}

	return json.Marshal(request)
}

// sseEvent represents a parsed SSE event from an execution engine stream
type sseEvent struct {
	Type   string                   `json:"type"`
	Chunk  json.RawMessage          `json:"chunk,omitempty"`
	Error  string                   `json:"error,omitempty"`
	Result *ExecutionEngineResponse `json:"result,omitempty"`
}

func recordTokenUsage(ctx context.Context, usage TokenUsage) {
	if usage.TotalTokens > 0 {
		tc := tokens.NewTokenCollector()
		tc.AddTokenUsage(ctx, arkv1alpha1.TokenUsage{
			PromptTokens:     usage.PromptTokens,
			CompletionTokens: usage.CompletionTokens,
			TotalTokens:      usage.TotalTokens,
		})
	}
}

// handleSSEEvent processes a single SSE event, returning messages to collect and any error
func handleSSEEvent(ctx context.Context, event sseEvent, eventStream EventStreamInterface) ([]Message, error) {
	switch event.Type {
	case "chunk":
		if eventStream != nil && event.Chunk != nil {
			if streamErr := eventStream.StreamChunk(ctx, json.RawMessage(event.Chunk)); streamErr != nil {
				logf.Log.Error(streamErr, "failed to forward chunk to event stream")
			}
		}
	case "result":
		if event.Result != nil {
			recordTokenUsage(ctx, event.Result.TokenUsage)
			messages := make([]Message, 0, len(event.Result.Messages))
			for _, msg := range event.Result.Messages {
				messages = append(messages, convertFromExecutionEngineMessage(msg))
			}
			return messages, nil
		}
	case "error":
		if event.Error != "" {
			return nil, fmt.Errorf("execution engine streaming error: %s", event.Error)
		}
	}
	return nil, nil
}

// parseSSEStream reads SSE events and returns final messages, forwarding chunks to eventStream
func parseSSEStream(ctx context.Context, resp *http.Response, eventStream EventStreamInterface) ([]Message, error) {
	var finalMessages []Message
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var event sseEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			logf.Log.Error(err, "failed to parse SSE event")
			continue
		}

		messages, err := handleSSEEvent(ctx, event, eventStream)
		if err != nil {
			return nil, err
		}
		finalMessages = append(finalMessages, messages...)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("SSE stream read error: %w", err)
	}
	return finalMessages, nil
}

// ExecuteStreamingWithEngine sends a request to the execution engine's SSE streaming endpoint
// using a pre-resolved engine config, and forwards events to the provided EventStreamInterface
func (c *ExecutionEngineClient) ExecuteStreamingWithEngine(ctx context.Context, params executeParams, eventStream EventStreamInterface) ([]Message, error) {
	operationData := map[string]string{
		"engineName": params.engineRef.Name,
		"agentName":  params.agentConfig.Name,
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Streaming execution via engine %s", params.engineRef.Name), operationData)

	requestBody, err := buildRequestBody(params.agentConfig, params.userInput, params.history, params.tools, params.workspace)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to marshal request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	streamURL := fmt.Sprintf("%s/execute-stream", params.engine.address)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, streamURL, bytes.NewBuffer(requestBody))
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to create request: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	httpClient := c.httpClientWithTimeout(params.engine.timeout)
	resp, err := httpClient.Do(req)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Streaming request failed: %v", err), err, operationData)
		return nil, fmt.Errorf("streaming request failed: %w", err)
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

	finalMessages, err := parseSSEStream(ctx, resp, eventStream)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", err.Error(), err, operationData)
		return nil, err
	}

	c.eventingRecorder.Complete(ctx, "ExecutionEngine", "Streaming execution completed successfully", operationData)
	return finalMessages, nil
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
		Labels:       agent.Labels,
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

func convertResolvedParameters(resolved map[string]string) []Parameter {
	if len(resolved) == 0 {
		return nil
	}
	params := make([]Parameter, 0, len(resolved))
	for name, value := range resolved {
		params = append(params, Parameter{Name: name, Value: value})
	}
	sort.Slice(params, func(i, j int) bool { return params[i].Name < params[j].Name })
	return params
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
		case ModelTypeCompletions:
			switch model.Provider.(type) {
			case *OpenAIProvider:
				modelConfig["openai"] = configProvider.BuildConfig()
			case *AzureProvider:
				modelConfig["azure"] = configProvider.BuildConfig()
			case *BedrockModel:
				modelConfig["bedrock"] = configProvider.BuildConfig()
			}
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
