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
	toolOutcomes := make([]A2AToolOutcome, 0)

	contextID, taskID := resolveA2AMetadataFromInput(ctx, userInput)
	newMessages := make([]protocol.Message, 0)

	for {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		turnResult, err := e.provider.A2ATurn(ctx, agentMessages, toolOutcomes, toolDefs, eventStream)
		if err != nil {
			return nil, err
		}
		toolOutcomes = nil

		a2aAssistantMsg := stampA2AMessageMetadata(turnResult.Message, contextID, taskID)
		agentMessages = append(agentMessages, a2aAssistantMsg)
		newMessages = append(newMessages, a2aAssistantMsg)

		if len(turnResult.ToolCalls) == 0 {
			result := &ExecutionResult{
				A2AMessages: newMessages,
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

		outcomes, err := e.executeA2AToolCalls(ctx, turnResult.ToolCalls, eventStream, contextID, taskID)
		if err != nil {
			logger := logf.FromContext(ctx)
			if !IsTerminateTeam(err) {
				logger.Error(err, "Tool execution failed", "agent", e.agentName)
			}
			return nil, err
		}
		toolOutcomes = outcomes
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

func (e *A2ALocalEngine) executeA2AToolCalls(ctx context.Context, toolCalls []A2AToolCall, eventStream EventStreamInterface, contextID, taskID string) ([]A2AToolOutcome, error) {
	execCtx := WithToolEventStream(ctx, eventStream)
	outcomes := make([]A2AToolOutcome, 0, len(toolCalls))
	for _, tc := range toolCalls {
		if execCtx.Err() != nil {
			return nil, execCtx.Err()
		}
		if e.tools == nil {
			return nil, fmt.Errorf("agent %s has no tools configured", e.agentName)
		}

		result, toolErr := e.tools.ExecuteToolA2A(execCtx, tc)
		outcome := buildA2AToolOutcome(tc, result, toolErr, contextID, taskID)
		outcomes = append(outcomes, outcome)

		if toolErr != nil {
			return outcomes, toolErr
		}
	}
	return outcomes, nil
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

func buildA2AToolOutcome(call A2AToolCall, result ToolResult, toolErr error, contextID, taskID string) A2AToolOutcome {
	toolCallID := call.ID
	if toolCallID == "" && result.ID != "" {
		toolCallID = result.ID
	}
	toolName := call.Name
	if result.Name != "" {
		toolName = result.Name
	}

	stepPayload := &StepEventPayloadV1{
		Schema:     A2APayloadSchemaStepEventV1,
		StepKind:   A2ADelegatedToolKindTool,
		ToolCallID: toolCallID,
		ToolName:   toolName,
	}
	if stepID := buildToolStepID(toolCallID); stepID != "" {
		stepPayload.StepID = stepID
	}

	outcome := A2AToolOutcome{
		ToolCallID: toolCallID,
		ToolName:   toolName,
		Content:    result.Content,
		TaskID:     taskID,
		ContextID:  contextID,
	}
	if toolErr != nil {
		outcome.Error = toolErr.Error()
		stepPayload.StepState = "error"
	} else {
		stepPayload.StepState = "done"
		if result.Error != "" {
			outcome.Error = result.Error
		}
	}
	payloadContent, err := buildToolResultPayloadContent(ToolResultPayloadV1{
		Schema:             A2APayloadSchemaToolResultV1,
		ToolCallID:         toolCallID,
		ToolName:           toolName,
		Content:            result.Content,
		Error:              outcome.Error,
		Step:               stepPayload,
		DelegatedTaskID:    taskID,
		DelegatedContextID: contextID,
	})
	if err == nil {
		outcome.Content = payloadContent
	}
	return outcome
}
