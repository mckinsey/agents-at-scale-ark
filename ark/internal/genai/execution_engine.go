package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	a2aclient "trpc.group/trpc-go/trpc-a2a-go/client"
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

func (c *ExecutionEngineA2AClient) ExecuteA2A(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, agentConfig AgentConfig, userInput protocol.Message, history []protocol.Message, tools []ToolDefinition) ([]protocol.Message, error) {
	operationData := map[string]string{
		"engineName": engineRef.Name,
		"agentName":  agentConfig.Name,
		"protocol":   "a2a-native",
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Executing agent via A2A execution engine %s (native)", engineRef.Name), operationData)

	engineAddress, err := c.resolveExecutionEngineAddress(ctx, engineRef, agentConfig.Namespace)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine: %w", err)
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
	historyMessages, err := convertA2AToExecutionEngineMessages(history)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to convert history: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to convert A2A history for execution engine: %w", err)
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

	message := userInput
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

	responseMessages, err := extractResponseMessages(result)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to extract response: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to extract response from A2A result: %w", err)
	}

	c.eventingRecorder.Complete(ctx, "ExecutionEngine", "A2A native execution engine completed successfully", operationData)
	return responseMessages, nil
}

func (c *ExecutionEngineA2AClient) ExecuteA2AWithToolCallback(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, agentConfig AgentConfig, userInput protocol.Message, history []protocol.Message, tools []ToolDefinition, toolRegistry *ToolRegistry, eventStream EventStreamInterface) ([]protocol.Message, error) {
	operationData := map[string]string{
		"engineName": engineRef.Name,
		"agentName":  agentConfig.Name,
		"protocol":   "a2a-native-with-callback",
	}
	ctx = c.eventingRecorder.Start(ctx, "ExecutionEngine", fmt.Sprintf("Executing agent via A2A engine %s (with tool callback)", engineRef.Name), operationData)

	engineAddress, err := c.resolveExecutionEngineAddress(ctx, engineRef, agentConfig.Namespace)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to resolve execution engine: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to resolve execution engine: %w", err)
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
	historyMessages, err := convertA2AToExecutionEngineMessages(history)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to convert history: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to convert A2A history for execution engine: %w", err)
	}

	arkMetadata := map[string]any{
		"agent":   agentConfig,
		"tools":   toolDefs,
		"history": historyMessages,
	}
	metadataBytes, err := json.Marshal(map[string]any{ArkMetadataKey: arkMetadata})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal A2A metadata: %w", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return nil, fmt.Errorf("failed to prepare A2A metadata: %w", err)
	}

	message := userInput
	message.Metadata = metadata

	a2aClient, err := CreateA2AClient(ctx, c.client, engineAddress, nil, agentConfig.Namespace, agentConfig.Name, nil)
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("Failed to create A2A client: %v", err), err, operationData)
		return nil, fmt.Errorf("failed to create A2A client: %w", err)
	}

	events, err := a2aClient.StreamMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
	})
	if err != nil {
		c.eventingRecorder.Fail(ctx, "ExecutionEngine", fmt.Sprintf("A2A streaming execution failed: %v", err), err, operationData)
		return c.fallbackToBlocking(ctx, a2aClient, message, operationData)
	}

	return c.consumeEngineStreamWithToolCallback(ctx, events, a2aClient, toolRegistry, eventStream, agentConfig.Name, operationData)
}

func (c *ExecutionEngineA2AClient) fallbackToBlocking(ctx context.Context, a2aClient *a2aclient.A2AClient, message protocol.Message, operationData map[string]string) ([]protocol.Message, error) {
	blocking := true
	result, err := a2aClient.SendMessage(ctx, protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("A2A blocking fallback failed: %w", err)
	}
	return extractResponseMessages(result)
}

func (c *ExecutionEngineA2AClient) consumeEngineStreamWithToolCallback(ctx context.Context, events <-chan protocol.StreamingMessageEvent, a2aClient *a2aclient.A2AClient, toolRegistry *ToolRegistry, eventStream EventStreamInterface, agentName string, operationData map[string]string) ([]protocol.Message, error) {
	var resultMessages []protocol.Message
	var taskID, contextID string

	currentEvents := events

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case event, ok := <-currentEvents:
			if !ok {
				c.eventingRecorder.Complete(ctx, "ExecutionEngine", "A2A engine execution completed", operationData)
				return resultMessages, nil
			}
			if event.Result == nil {
				continue
			}

			switch result := event.Result.(type) {
			case *protocol.TaskStatusUpdateEvent:
				if result.TaskID != "" {
					taskID = result.TaskID
				}
				if result.ContextID != "" {
					contextID = result.ContextID
				}

				if result.Status.State == protocol.TaskStateInputRequired {
					toolRequest := parseToolRequestPayload(result.Status.Message)
					if toolRequest != nil && toolRegistry != nil {
						toolResults, err := c.executeToolCallbacks(ctx, toolRequest, toolRegistry, eventStream, contextID, taskID)
						if err != nil {
							return nil, fmt.Errorf("tool callback execution failed: %w", err)
						}

						resultMsg := buildToolResultV2Message(toolResults)
						if taskID != "" {
							resultMsg.TaskID = &taskID
						}
						if contextID != "" {
							resultMsg.ContextID = &contextID
						}

						_, err = a2aClient.SendMessage(ctx, protocol.SendMessageParams{
							RPCID:   protocol.GenerateRPCID(),
							Message: resultMsg,
						})
						if err != nil {
							return nil, fmt.Errorf("failed to send tool results to engine: %w", err)
						}

						resumed, err := a2aClient.ResubscribeTask(ctx, protocol.TaskIDParams{
							RPCID: protocol.GenerateRPCID(),
							ID:    taskID,
						})
						if err != nil {
							return nil, fmt.Errorf("failed to resubscribe after tool callback: %w", err)
						}
						currentEvents = resumed
						continue
					}
				}

				if result.Status.Message != nil {
					if text := extractTextFromParts(result.Status.Message.Parts); text != "" {
						resultMessages = append(resultMessages, *result.Status.Message)
					}
				}
				if err := streamA2AEvent(ctx, eventStream, result); err != nil {
					return nil, err
				}
				if result.Final {
					c.eventingRecorder.Complete(ctx, "ExecutionEngine", "A2A engine execution completed", operationData)
					return resultMessages, nil
				}

			case *protocol.TaskArtifactUpdateEvent:
				if result.TaskID != "" {
					taskID = result.TaskID
				}
				text := extractTextFromParts(result.Artifact.Parts)
				if text != "" {
					msg := protocol.NewMessage(protocol.MessageRoleAgent, result.Artifact.Parts)
					resultMessages = append(resultMessages, msg)
				}
				if err := streamA2AEvent(ctx, eventStream, result); err != nil {
					return nil, err
				}

			case *protocol.Message:
				resultMessages = append(resultMessages, *result)
				if err := streamA2AEvent(ctx, eventStream, result); err != nil {
					return nil, err
				}

			case *protocol.Task:
				if result.ID != "" {
					taskID = result.ID
				}
				if result.ContextID != "" {
					contextID = result.ContextID
				}
				msgs, _ := extractMessagesFromTask(result)
				resultMessages = append(resultMessages, msgs...)
				if err := streamA2AEvent(ctx, eventStream, result); err != nil {
					return nil, err
				}
			}
		}
	}
}

func (c *ExecutionEngineA2AClient) executeToolCallbacks(ctx context.Context, toolRequest *ToolRequestPayloadV1, toolRegistry *ToolRegistry, eventStream EventStreamInterface, contextID, taskID string) ([]ToolResultEntryV2, error) {
	results := make([]ToolResultEntryV2, 0, len(toolRequest.Calls))
	execCtx := WithToolEventStream(ctx, eventStream)

	for _, call := range toolRequest.Calls {
		if execCtx.Err() != nil {
			return nil, execCtx.Err()
		}

		toolCall := A2AToolCall{
			ID:        call.ToolCallID,
			Name:      call.ToolName,
			Arguments: call.Arguments,
		}
		toolResult, toolErr := toolRegistry.ExecuteToolA2A(execCtx, toolCall)

		entry := ToolResultEntryV2{
			ToolCallID: call.ToolCallID,
			ToolName:   call.ToolName,
		}
		if toolErr != nil {
			entry.Error = toolErr.Error()
		} else {
			entry.Content = toolResult.Content
			if toolResult.Error != "" {
				entry.Error = toolResult.Error
			}
		}
		results = append(results, entry)
	}
	return results, nil
}

func (c *ExecutionEngineA2AClient) RecoverTask(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, namespace, taskID string) (*protocol.Task, <-chan protocol.StreamingMessageEvent, error) {
	engineAddress, err := c.resolveExecutionEngineAddress(ctx, engineRef, namespace)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to resolve engine address for recovery: %w", err)
	}

	a2aClient, err := CreateA2AClient(ctx, c.client, engineAddress, nil, namespace, "recovery", nil)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create A2A client for recovery: %w", err)
	}

	task, err := a2aClient.GetTasks(ctx, protocol.TaskQueryParams{
		RPCID: protocol.GenerateRPCID(),
		ID:    taskID,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get task %s for recovery: %w", taskID, err)
	}

	if isTerminalState(task.Status.State) {
		return task, nil, nil
	}

	events, err := a2aClient.ResubscribeTask(ctx, protocol.TaskIDParams{
		RPCID: protocol.GenerateRPCID(),
		ID:    taskID,
	})
	if err != nil {
		return task, nil, fmt.Errorf("failed to resubscribe to task %s: %w", taskID, err)
	}

	return task, events, nil
}

func isTerminalState(state protocol.TaskState) bool {
	return state == protocol.TaskStateCompleted ||
		state == protocol.TaskStateFailed ||
		state == protocol.TaskStateCanceled
}

func (c *ExecutionEngineA2AClient) CancelTask(ctx context.Context, engineRef *arkv1alpha1.ExecutionEngineRef, namespace, taskID string) error {
	engineAddress, err := c.resolveExecutionEngineAddress(ctx, engineRef, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve engine address for cancel: %w", err)
	}

	a2aClient, err := CreateA2AClient(ctx, c.client, engineAddress, nil, namespace, "cancel", nil)
	if err != nil {
		return fmt.Errorf("failed to create A2A client for cancel: %w", err)
	}

	_, err = a2aClient.CancelTasks(ctx, protocol.TaskIDParams{
		RPCID: protocol.GenerateRPCID(),
		ID:    taskID,
	})
	return err
}

func extractResponseMessages(result *protocol.MessageResult) ([]protocol.Message, error) {
	if result == nil {
		return nil, fmt.Errorf("nil result from A2A server")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		return []protocol.Message{*r}, nil
	case *protocol.Task:
		return extractMessagesFromTask(r)
	default:
		return nil, fmt.Errorf("unexpected A2A result type: %T", result.Result)
	}
}

func extractMessagesFromTask(task *protocol.Task) ([]protocol.Message, error) {
	if task.Status.State == "" {
		return nil, fmt.Errorf("task has no status state")
	}

	var messages []protocol.Message
	for _, msg := range task.History {
		if msg.Role == protocol.MessageRoleAgent {
			messages = append(messages, msg)
		}
	}
	if task.Status.Message != nil {
		messages = append(messages, *task.Status.Message)
	}

	if len(messages) == 0 {
		return nil, fmt.Errorf("no agent messages in task result (state=%s)", task.Status.State)
	}
	return messages, nil
}

func extractResponseText(result *protocol.MessageResult) (string, error) {
	if result == nil {
		return "", fmt.Errorf("nil result from A2A server")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		return extractTextFromParts(r.Parts), nil
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

func convertA2AToExecutionEngineMessages(messages []protocol.Message) ([]ExecutionEngineMessage, error) {
	if len(messages) == 0 {
		return nil, nil
	}
	converted := make([]ExecutionEngineMessage, 0, len(messages))
	for i := range messages {
		compatMessage, err := A2AToOpenAIMessageMultimodal(messages[i])
		if err != nil {
			return nil, fmt.Errorf("history message %d: %w", i, err)
		}
		converted = append(converted, convertToExecutionEngineMessage(compatMessage))
	}
	return converted, nil
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
