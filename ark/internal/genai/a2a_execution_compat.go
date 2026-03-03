package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func (a *Agent) executeWithExternalA2ANativeExecutionEngine(ctx context.Context, userInput protocol.Message, history []protocol.Message, _ MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	engineClient := NewExecutionEngineA2AClient(a.client, a.eventing.ExecutionEngineRecorder())

	agentConfig, err := buildAgentConfig(a)
	if err != nil {
		return nil, err
	}

	resolvedPrompt, err := a.resolvePrompt(ctx)
	if err != nil {
		return nil, fmt.Errorf("agent %s prompt resolution failed: %w", a.FullName(), err)
	}
	agentConfig.Prompt = resolvedPrompt

	toolDefinitions := buildToolDefinitions(a.Tools)
	effectiveEngineRef := resolveEffectiveEngineRef(a.ExecutionEngine, a.Namespace)

	resultMessages, err := engineClient.ExecuteA2AWithToolCallback(ctx, effectiveEngineRef, agentConfig, userInput, history, toolDefinitions, a.Tools, eventStream)
	if err != nil {
		return nil, err
	}

	result := &ExecutionResult{
		A2AMessages: resultMessages,
	}
	if len(resultMessages) > 0 {
		lastMessage := resultMessages[len(resultMessages)-1]
		result.A2AResponse = &A2AResponse{
			Content:   ExtractA2ATextFromMessage(lastMessage),
			ContextID: dereferenceMessageID(lastMessage.ContextID),
			TaskID:    dereferenceMessageID(lastMessage.TaskID),
			Message:   &lastMessage,
		}
		if err := streamNativeA2AMessageStrict(ctx, eventStream, lastMessage, "external-final"); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func resolveA2AMetadataFromInput(ctx context.Context, userInput protocol.Message) (string, string) {
	contextID := GetA2AContextID(ctx)
	if userInput.ContextID != nil && *userInput.ContextID != "" {
		contextID = *userInput.ContextID
	}
	taskID := getQueryID(ctx)
	if userInput.TaskID != nil && *userInput.TaskID != "" {
		taskID = *userInput.TaskID
	}
	return contextID, taskID
}

func stampA2AMessageMetadata(message protocol.Message, contextID, taskID string) protocol.Message {
	if message.ContextID == nil && contextID != "" {
		contextIDCopy := contextID
		message.ContextID = &contextIDCopy
	}
	if message.TaskID == nil && taskID != "" {
		taskIDCopy := taskID
		message.TaskID = &taskIDCopy
	}
	return message
}

func dereferenceMessageID(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
