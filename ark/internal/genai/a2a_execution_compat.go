package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func (a *Agent) executeWithA2ACompatExecution(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	compatUserInput, compatHistory, err := convertA2AInputToCompatMessages(userInput, history)
	if err != nil {
		return nil, err
	}

	execCtx := WithA2AExperimentalEnabled(ctx, false)
	execCtx = WithA2APayloadMode(execCtx, A2APayloadModeCompat)

	var messages []Message
	if a.ExecutionEngine == nil {
		messages, err = a.executeLocally(execCtx, compatUserInput, compatHistory, memory, eventStream)
	} else {
		messages, err = a.executeWithExecutionEngine(execCtx, compatUserInput, compatHistory)
	}
	if err != nil {
		return nil, err
	}

	contextID, taskID := resolveA2AMetadataFromInput(ctx, userInput)
	a2aMessages, err := convertCompatMessagesToA2A(messages, contextID, taskID)
	if err != nil {
		return nil, err
	}

	// A2APayloadModeNative: the compat wrapper produces protocol-native A2A output
	// despite running OpenAI execution internally; callers receive native messages.
	result := &ExecutionResult{
		Messages:       messages,
		A2AMessages:    a2aMessages,
		A2APayloadMode: A2APayloadModeNative,
	}
	if len(a2aMessages) > 0 {
		lastMessage := a2aMessages[len(a2aMessages)-1]
		result.A2AResponse = &A2AResponse{
			Content:   ExtractA2ATextFromMessage(lastMessage),
			ContextID: dereferenceMessageID(lastMessage.ContextID),
			TaskID:    dereferenceMessageID(lastMessage.TaskID),
			Message:   &lastMessage,
		}
		if err := streamNativeA2AMessageStrict(ctx, eventStream, lastMessage, "compat-final"); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (a *Agent) executeWithExternalA2ANativeExecutionEngine(ctx context.Context, userInput protocol.Message, history []protocol.Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
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

	resultMessages, err := engineClient.ExecuteA2A(ctx, a.ExecutionEngine, agentConfig, userInput, history, toolDefinitions)
	if err != nil {
		return nil, err
	}

	result := &ExecutionResult{
		A2AMessages:    resultMessages,
		A2APayloadMode: A2APayloadModeNative,
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

func convertA2AInputToCompatMessages(userInput protocol.Message, history []protocol.Message) (Message, []Message, error) {
	compatHistory := make([]Message, 0, len(history))
	for i := range history {
		converted, err := A2AToOpenAIMessage(history[i])
		if err != nil {
			return Message{}, nil, fmt.Errorf("failed to convert A2A history message %d to OpenAI format: %w", i, err)
		}
		compatHistory = append(compatHistory, converted)
	}
	compatUserInput, err := A2AToOpenAIMessage(userInput)
	if err != nil {
		return Message{}, nil, fmt.Errorf("failed to convert A2A user input to OpenAI format: %w", err)
	}
	return compatUserInput, compatHistory, nil
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

func convertCompatMessagesToA2A(messages []Message, contextID, taskID string) ([]protocol.Message, error) {
	a2aMessages := make([]protocol.Message, 0, len(messages))
	for i := range messages {
		converted, err := OpenAIToA2AMessage(messages[i])
		if err != nil {
			return nil, fmt.Errorf("failed to convert compat message %d to A2A format: %w", i, err)
		}
		a2aMessages = append(a2aMessages, stampA2AMessageMetadata(converted, contextID, taskID))
	}
	return a2aMessages, nil
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
