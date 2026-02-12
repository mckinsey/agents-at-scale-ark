package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func (a *Agent) executeLocallyA2ANative(ctx context.Context, userInput protocol.Message, history []protocol.Message, _ MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if a.Model == nil {
		return nil, fmt.Errorf("agent %s has no model configured", a.FullName())
	}

	var tools []openai.ChatCompletionToolParam
	if a.Tools != nil {
		tools = a.Tools.ToOpenAITools()
	}

	agentMessages, err := a.prepareA2ANativeMessages(ctx, userInput, history)
	if err != nil {
		return nil, err
	}

	contextID, taskID := resolveA2AMetadataFromInput(ctx, userInput)
	newMessages := make([]protocol.Message, 0)

	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		compatMessages, err := convertA2AMessagesToCompat(agentMessages)
		if err != nil {
			return nil, err
		}

		modelCtx := WithA2AExperimentalEnabled(ctx, false)
		modelCtx = WithA2APayloadMode(modelCtx, A2APayloadModeCompat)
		response, err := a.executeModelCall(modelCtx, compatMessages, tools, nil)
		if err != nil {
			return nil, err
		}

		choice := response.Choices[0]
		assistantMessage := a.processAssistantMessage(choice)
		a2aAssistantMessage, err := OpenAIToA2AMessage(assistantMessage)
		if err != nil {
			return nil, fmt.Errorf("failed to convert assistant message to A2A: %w", err)
		}
		a2aAssistantMessage = stampA2AMessageMetadata(a2aAssistantMessage, contextID, taskID)
		agentMessages = append(agentMessages, a2aAssistantMessage)
		newMessages = append(newMessages, a2aAssistantMessage)

		if len(choice.Message.ToolCalls) == 0 {
			result := &ExecutionResult{
				A2AMessages:    newMessages,
				A2APayloadMode: A2APayloadModeNative,
			}
			lastMessage := newMessages[len(newMessages)-1]
			result.A2AResponse = &A2AResponse{
				Content:   ExtractA2ATextFromMessage(lastMessage),
				ContextID: dereferenceMessageID(lastMessage.ContextID),
				TaskID:    dereferenceMessageID(lastMessage.TaskID),
				Message:   &lastMessage,
			}
			if err := streamNativeA2AMessageStrict(ctx, eventStream, lastMessage, "final"); err != nil {
				return nil, err
			}
			return result, nil
		}

		if err := streamNativeA2AMessageStrict(ctx, eventStream, a2aAssistantMessage, "assistant"); err != nil {
			return nil, err
		}
		if err := a.executeToolCallsA2ANative(ctx, choice.Message.ToolCalls, eventStream, &agentMessages, &newMessages, contextID, taskID); err != nil {
			logger := logf.FromContext(ctx)
			if !IsTerminateTeam(err) {
				logger.Error(err, "Tool execution failed", "agent", a.FullName())
			}
			return nil, err
		}
	}
}

func (a *Agent) prepareA2ANativeMessages(ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	resolvedPrompt, err := a.resolvePrompt(ctx)
	if err != nil {
		return nil, fmt.Errorf("agent %s prompt resolution failed: %w", a.FullName(), err)
	}

	systemMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(resolvedPrompt),
	})
	systemMessage.Metadata = map[string]interface{}{
		MetadataRoleKey: RoleSystem,
	}

	agentMessages := make([]protocol.Message, 0, len(history)+2)
	agentMessages = append(agentMessages, systemMessage)
	agentMessages = append(agentMessages, history...)
	agentMessages = append(agentMessages, userInput)
	return agentMessages, nil
}

func convertA2AMessagesToCompat(messages []protocol.Message) ([]Message, error) {
	compatMessages := make([]Message, 0, len(messages))
	for i := range messages {
		converted, err := A2AToOpenAIMessage(messages[i])
		if err != nil {
			return nil, fmt.Errorf("failed to convert A2A message %d to OpenAI format: %w", i, err)
		}
		compatMessages = append(compatMessages, converted)
	}
	return compatMessages, nil
}

func (a *Agent) executeToolCallsA2ANative(ctx context.Context, toolCalls []openai.ChatCompletionMessageToolCall, eventStream EventStreamInterface, agentMessages, newMessages *[]protocol.Message, contextID, taskID string) error {
	execCtx := WithToolEventStream(ctx, eventStream)
	for _, tc := range toolCalls {
		if execCtx.Err() != nil {
			return execCtx.Err()
		}
		if a.Tools == nil {
			return fmt.Errorf("agent %s has no tools configured", a.FullName())
		}

		// Tool result round-trips through OpenAI ToolMessage because ToolResult
		// carries OpenAI-shaped data; a native A2A tool result interface would
		// remove this intermediate conversion.
		result, toolErr := a.Tools.ExecuteTool(execCtx, tc)
		toolMessage := ToolMessage(result.Content, result.ID)
		convertedToolMessage, conversionErr := OpenAIToA2AMessage(toolMessage)
		if conversionErr != nil {
			return fmt.Errorf("failed to convert tool message to A2A: %w", conversionErr)
		}

		convertedToolMessage = stampA2AMessageMetadata(convertedToolMessage, contextID, taskID)
		*agentMessages = append(*agentMessages, convertedToolMessage)
		*newMessages = append(*newMessages, convertedToolMessage)

		if toolErr != nil {
			return toolErr
		}
		if streamErr := streamNativeA2AMessageStrict(execCtx, eventStream, convertedToolMessage, "tool"); streamErr != nil {
			return streamErr
		}
	}
	return nil
}

func streamNativeA2AMessageStrict(ctx context.Context, eventStream EventStreamInterface, message protocol.Message, phase string) error {
	if eventStream == nil {
		return nil
	}
	if err := eventStream.StreamChunk(ctx, &message); err != nil {
		return fmt.Errorf("failed to stream %s A2A message: %w", phase, err)
	}
	return nil
}
