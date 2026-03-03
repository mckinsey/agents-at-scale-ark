package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"mckinsey.com/ark-query-engine/internal/protocol"
	"mckinsey.com/ark-query-engine/internal/provider"
	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
)

var _ taskmanager.MessageProcessor = (*Engine)(nil)

type Engine struct {
	mu             sync.Mutex
	pendingResults map[string]chan *protocol.ToolResultPayloadV1
}

func New() *Engine {
	return &Engine{
		pendingResults: make(map[string]chan *protocol.ToolResultPayloadV1),
	}
}

func (e *Engine) ProcessMessage(
	ctx context.Context,
	message a2aprotocol.Message,
	options taskmanager.ProcessOptions,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	metadata := extractEngineMetadata(message)

	if metadata == nil {
		return e.handleToolResultMessage(ctx, message, handler)
	}

	prov, err := createProvider(metadata.Agent.Model)
	if err != nil {
		return nil, err
	}

	tools := convertToolDefs(metadata.Tools)

	taskID, err := handler.BuildTask(nil, message.ContextID)
	if err != nil {
		return nil, fmt.Errorf("failed to build task: %w", err)
	}

	if options.Streaming {
		return e.processStreaming(ctx, taskID, message, prov, tools, metadata, handler)
	}
	return e.processBlocking(ctx, taskID, message, prov, tools, metadata, handler)
}

func (e *Engine) processBlocking(
	ctx context.Context,
	taskID string,
	message a2aprotocol.Message,
	prov provider.ModelProvider,
	tools []provider.ToolDefinition,
	metadata *protocol.EngineMetadata,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateWorking, nil)

	systemMsg := buildSystemMessage(metadata.Agent.Prompt)
	messages := []a2aprotocol.Message{systemMsg, message}

	resultChan := e.getOrCreateResultChan(taskID)
	defer e.removeResultChan(taskID)

	var toolOutcomes []provider.ToolOutcome

	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		turnResult, err := prov.Turn(ctx, messages, toolOutcomes, tools, nil)
		if err != nil {
			return nil, err
		}
		toolOutcomes = nil

		messages = append(messages, turnResult.Message)

		if len(turnResult.ToolCalls) == 0 {
			handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateCompleted, &turnResult.Message)
			return &taskmanager.MessageProcessingResult{
				Result: &turnResult.Message,
			}, nil
		}

		toolRequest := buildToolRequest(turnResult.ToolCalls)
		requestMsg := buildToolRequestMessage(toolRequest)
		handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateInputRequired, &requestMsg)

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case toolResult := <-resultChan:
			if toolResult == nil {
				return nil, fmt.Errorf("nil tool result received")
			}
			toolOutcomes = convertToolResults(toolResult)
			handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateWorking, nil)
		}
	}
}

func (e *Engine) processStreaming(
	ctx context.Context,
	taskID string,
	message a2aprotocol.Message,
	prov provider.ModelProvider,
	tools []provider.ToolDefinition,
	metadata *protocol.EngineMetadata,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	sub, err := handler.SubscribeTask(&taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe to task: %w", err)
	}

	go e.runStreamingLoop(ctx, taskID, message, prov, tools, metadata, handler, sub)

	return &taskmanager.MessageProcessingResult{
		StreamingEvents: sub,
	}, nil
}

func (e *Engine) runStreamingLoop(
	ctx context.Context,
	taskID string,
	message a2aprotocol.Message,
	prov provider.ModelProvider,
	tools []provider.ToolDefinition,
	metadata *protocol.EngineMetadata,
	handler taskmanager.TaskHandler,
	sub taskmanager.TaskSubscriber,
) {
	defer sub.Close()

	resultChan := e.getOrCreateResultChan(taskID)
	defer e.removeResultChan(taskID)

	handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateWorking, nil)
	sendStatusEvent(sub, taskID, a2aprotocol.TaskStateWorking, nil, false)

	systemMsg := buildSystemMessage(metadata.Agent.Prompt)
	messages := []a2aprotocol.Message{systemMsg, message}

	var toolOutcomes []provider.ToolOutcome

	for {
		if ctx.Err() != nil {
			e.sendErrorEvent(sub, taskID, ctx.Err())
			return
		}

		turnResult, err := prov.Turn(ctx, messages, toolOutcomes, tools, nil)
		if err != nil {
			e.sendErrorEvent(sub, taskID, err)
			return
		}
		toolOutcomes = nil

		messages = append(messages, turnResult.Message)

		if len(turnResult.ToolCalls) == 0 {
			if turnResult.Content != "" {
				sub.Send(a2aprotocol.StreamingMessageEvent{
					Result: &a2aprotocol.TaskArtifactUpdateEvent{
						TaskID: taskID,
						Artifact: a2aprotocol.Artifact{
							Parts: []a2aprotocol.Part{a2aprotocol.NewTextPart(turnResult.Content)},
						},
					},
				})
			}
			handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateCompleted, &turnResult.Message)
			sendStatusEvent(sub, taskID, a2aprotocol.TaskStateCompleted, &turnResult.Message, true)
			return
		}

		toolRequest := buildToolRequest(turnResult.ToolCalls)
		requestMsg := buildToolRequestMessage(toolRequest)
		handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateInputRequired, &requestMsg)
		sendStatusEvent(sub, taskID, a2aprotocol.TaskStateInputRequired, &requestMsg, false)

		select {
		case <-ctx.Done():
			e.sendErrorEvent(sub, taskID, ctx.Err())
			return
		case toolResult := <-resultChan:
			if toolResult == nil {
				e.sendErrorEvent(sub, taskID, fmt.Errorf("nil tool result"))
				return
			}
			toolOutcomes = convertToolResults(toolResult)
			handler.UpdateTaskState(&taskID, a2aprotocol.TaskStateWorking, nil)
			sendStatusEvent(sub, taskID, a2aprotocol.TaskStateWorking, nil, false)
		}
	}
}

func (e *Engine) handleToolResultMessage(
	ctx context.Context,
	message a2aprotocol.Message,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	toolResult := extractToolResult(message)
	if toolResult == nil {
		return nil, protocol.NewEngineError(protocol.ErrorCodeInvalidConfig, "message has no engine metadata and no tool results")
	}

	contextID := handler.GetContextID()
	taskID := ""
	if message.TaskID != nil {
		taskID = *message.TaskID
	}

	if taskID == "" {
		e.mu.Lock()
		for id := range e.pendingResults {
			taskID = id
			break
		}
		e.mu.Unlock()
	}

	if taskID == "" {
		return nil, protocol.NewEngineError(protocol.ErrorCodeInvalidConfig, "cannot determine task ID for tool result")
	}

	e.mu.Lock()
	ch, ok := e.pendingResults[taskID]
	e.mu.Unlock()

	if !ok {
		return nil, protocol.NewEngineError(protocol.ErrorCodeInvalidConfig, fmt.Sprintf("no pending tool request for task %s", taskID))
	}

	select {
	case ch <- toolResult:
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	_ = contextID
	return &taskmanager.MessageProcessingResult{
		Result: &message,
	}, nil
}

func (e *Engine) getOrCreateResultChan(taskID string) chan *protocol.ToolResultPayloadV1 {
	e.mu.Lock()
	defer e.mu.Unlock()
	ch, ok := e.pendingResults[taskID]
	if !ok {
		ch = make(chan *protocol.ToolResultPayloadV1, 1)
		e.pendingResults[taskID] = ch
	}
	return ch
}

func (e *Engine) removeResultChan(taskID string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	delete(e.pendingResults, taskID)
}

func (e *Engine) sendErrorEvent(sub taskmanager.TaskSubscriber, taskID string, err error) {
	slog.Error("task failed", "taskID", taskID, "error", err)
	errMsg := a2aprotocol.NewMessage(a2aprotocol.MessageRoleAgent, []a2aprotocol.Part{
		a2aprotocol.NewTextPart(err.Error()),
	})
	sendStatusEvent(sub, taskID, a2aprotocol.TaskStateFailed, &errMsg, true)
}

func sendStatusEvent(sub taskmanager.TaskSubscriber, taskID string, state a2aprotocol.TaskState, message *a2aprotocol.Message, final bool) {
	sub.Send(a2aprotocol.StreamingMessageEvent{
		Result: &a2aprotocol.TaskStatusUpdateEvent{
			TaskID: taskID,
			Status: a2aprotocol.TaskStatus{
				State:   state,
				Message: message,
			},
			Final: final,
		},
	})
}

func extractEngineMetadata(msg a2aprotocol.Message) *protocol.EngineMetadata {
	if msg.Metadata == nil {
		return nil
	}
	raw, ok := msg.Metadata[protocol.ArkMetadataKey]
	if !ok {
		return nil
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return nil
	}
	var meta protocol.EngineMetadata
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil
	}
	if meta.Agent.Model.Name == "" {
		return nil
	}
	return &meta
}

func extractToolResult(msg a2aprotocol.Message) *protocol.ToolResultPayloadV1 {
	for _, part := range msg.Parts {
		if dp, ok := part.(*a2aprotocol.DataPart); ok && dp.Data != nil {
			data, err := json.Marshal(dp.Data)
			if err != nil {
				continue
			}
			var result protocol.ToolResultPayloadV1
			if err := json.Unmarshal(data, &result); err != nil {
				continue
			}
			if result.Schema == protocol.PayloadSchemaToolResultV1 {
				return &result
			}
		}
	}
	return nil
}

func createProvider(model protocol.EngineModel) (provider.ModelProvider, error) {
	config := model.Config

	switch model.Type {
	case "openai":
		return createOpenAIProvider(model.Name, config)
	case "azure":
		return createAzureProvider(model.Name, config)
	case "bedrock":
		return createBedrockProvider(model.Name, config)
	default:
		if model.Type == "" {
			return nil, protocol.NewEngineError(protocol.ErrorCodeInvalidConfig, "model type is required")
		}
		return nil, protocol.NewEngineError(protocol.ErrorCodeUnsupportedModel, fmt.Sprintf("unsupported model type: %s", model.Type))
	}
}

func createOpenAIProvider(modelName string, config map[string]any) (provider.ModelProvider, error) {
	p := &provider.OpenAIProvider{Model: modelName}
	if config != nil {
		if oaiConfig, ok := config["openai"].(map[string]any); ok {
			if v, ok := oaiConfig["baseUrl"].(string); ok {
				p.BaseURL = v
			}
			if v, ok := oaiConfig["apiKey"].(string); ok {
				p.APIKey = v
			}
		}
	}
	if p.BaseURL == "" {
		p.BaseURL = "https://api.openai.com/v1"
	}
	return p, nil
}

func createAzureProvider(modelName string, config map[string]any) (provider.ModelProvider, error) {
	p := &provider.AzureProvider{Model: modelName}
	if config != nil {
		if azConfig, ok := config["azure"].(map[string]any); ok {
			if v, ok := azConfig["baseUrl"].(string); ok {
				p.BaseURL = v
			}
			if v, ok := azConfig["apiKey"].(string); ok {
				p.APIKey = v
			}
			if v, ok := azConfig["apiVersion"].(string); ok {
				p.APIVersion = v
			}
		}
	}
	if p.APIVersion == "" {
		p.APIVersion = "2024-06-01"
	}
	return p, nil
}

func createBedrockProvider(modelName string, config map[string]any) (provider.ModelProvider, error) {
	p := &provider.BedrockProvider{Model: modelName}
	if config != nil {
		if bConfig, ok := config["bedrock"].(map[string]any); ok {
			if v, ok := bConfig["region"].(string); ok {
				p.Region = v
			}
			if v, ok := bConfig["accessKeyId"].(string); ok {
				p.AccessKeyID = v
			}
			if v, ok := bConfig["secretAccessKey"].(string); ok {
				p.SecretAccessKey = v
			}
		}
	}
	if p.Region == "" {
		p.Region = "us-east-1"
	}
	return p, nil
}

func convertToolDefs(defs []protocol.ToolDefinition) []provider.ToolDefinition {
	result := make([]provider.ToolDefinition, len(defs))
	for i, d := range defs {
		result[i] = provider.ToolDefinition{
			Name:        d.Name,
			Description: d.Description,
			Parameters:  d.Parameters,
		}
	}
	return result
}

func convertToolResults(payload *protocol.ToolResultPayloadV1) []provider.ToolOutcome {
	outcomes := make([]provider.ToolOutcome, len(payload.Results))
	for i, r := range payload.Results {
		outcomes[i] = provider.ToolOutcome{
			ToolCallID: r.ToolCallID,
			ToolName:   r.ToolName,
			Content:    r.Content,
			Error:      r.Error,
		}
	}
	return outcomes
}

func buildToolRequest(toolCalls []provider.ToolCall) *protocol.ToolRequestPayloadV1 {
	calls := make([]protocol.ToolRequestCall, len(toolCalls))
	for i, tc := range toolCalls {
		calls[i] = protocol.ToolRequestCall{
			ToolCallID: tc.ID,
			ToolName:   tc.Name,
			Arguments:  tc.Arguments,
		}
	}
	return &protocol.ToolRequestPayloadV1{
		Schema: protocol.PayloadSchemaToolRequestV1,
		Calls:  calls,
	}
}

func buildToolRequestMessage(payload *protocol.ToolRequestPayloadV1) a2aprotocol.Message {
	return a2aprotocol.NewMessage(a2aprotocol.MessageRoleAgent, []a2aprotocol.Part{
		&a2aprotocol.DataPart{
			Kind: a2aprotocol.KindData,
			Data: payload,
		},
	})
}

func buildSystemMessage(prompt string) a2aprotocol.Message {
	return a2aprotocol.NewMessage(a2aprotocol.MessageRoleAgent, []a2aprotocol.Part{
		a2aprotocol.NewTextPart(prompt),
		&a2aprotocol.DataPart{
			Kind: a2aprotocol.KindData,
			Data: map[string]string{
				"schema": protocol.PayloadSchemaRoleHintV1,
				"role":   "system",
			},
		},
	})
}
