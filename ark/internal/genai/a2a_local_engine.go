package genai

import (
	"context"
	"fmt"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type A2ALocalEngine struct {
	provider  A2AModelProvider
	tools     *ToolRegistry
	agentName string
}

func NewA2ALocalEngine(provider A2AModelProvider, tools *ToolRegistry, agentName string) *A2ALocalEngine {
	return &A2ALocalEngine{
		provider:  provider,
		tools:     tools,
		agentName: agentName,
	}
}

func (e *A2ALocalEngine) Execute(ctx context.Context, userInput protocol.Message, preparedMessages []protocol.Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if e.provider == nil {
		return nil, ErrA2AModelProviderNotSupported
	}

	toolDefs := e.buildToolDefinitions()
	agentMessages := preparedMessages

	contextID, taskID := resolveA2AMetadataFromInput(ctx, userInput)
	newMessages := make([]protocol.Message, 0)

	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		turnResult, err := e.provider.A2ATurn(ctx, agentMessages, toolDefs, eventStream)
		if err != nil {
			return nil, err
		}

		a2aAssistantMsg := stampA2AMessageMetadata(turnResult.Message, contextID, taskID)
		agentMessages = append(agentMessages, a2aAssistantMsg)
		newMessages = append(newMessages, a2aAssistantMsg)

		if len(turnResult.ToolCalls) == 0 {
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

		if err := streamNativeA2AMessageStrict(ctx, eventStream, a2aAssistantMsg, "assistant"); err != nil {
			return nil, err
		}

		if err := e.executeA2AToolCalls(ctx, turnResult.ToolCalls, eventStream, &agentMessages, &newMessages, contextID, taskID); err != nil {
			logger := logf.FromContext(ctx)
			if !IsTerminateTeam(err) {
				logger.Error(err, "Tool execution failed", "agent", e.agentName)
			}
			return nil, err
		}
	}
}

func (e *A2ALocalEngine) buildToolDefinitions() []A2AToolDefinition {
	if e.tools == nil {
		return nil
	}
	defs := e.tools.GetToolDefinitions()
	a2aDefs := make([]A2AToolDefinition, len(defs))
	for i, d := range defs {
		a2aDefs[i] = A2AToolDefinition{
			Name:        d.Name,
			Description: d.Description,
			Parameters:  d.Parameters,
		}
	}
	return a2aDefs
}

func (e *A2ALocalEngine) executeA2AToolCalls(ctx context.Context, toolCalls []A2AToolCall, eventStream EventStreamInterface, agentMessages, newMessages *[]protocol.Message, contextID, taskID string) error {
	execCtx := WithToolEventStream(ctx, eventStream)
	for _, tc := range toolCalls {
		if execCtx.Err() != nil {
			return execCtx.Err()
		}
		if e.tools == nil {
			return fmt.Errorf("agent %s has no tools configured", e.agentName)
		}

		result, toolErr := e.tools.ExecuteToolA2A(execCtx, tc)

		toolMsg := buildA2AToolResultMessage(result)
		toolMsg = stampA2AMessageMetadata(toolMsg, contextID, taskID)
		*agentMessages = append(*agentMessages, toolMsg)
		*newMessages = append(*newMessages, toolMsg)

		if toolErr != nil {
			return toolErr
		}
		if streamErr := streamNativeA2AMessageStrict(execCtx, eventStream, toolMsg, "tool"); streamErr != nil {
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

func buildA2AToolResultMessage(result ToolResult) protocol.Message {
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(result.Content),
	})
	message.Metadata = map[string]interface{}{
		MetadataRoleKey:       RoleTool,
		MetadataToolCallIDKey: result.ID,
	}
	if result.Name != "" {
		message.Metadata[MetadataToolNameKey] = result.Name
	}
	return message
}
