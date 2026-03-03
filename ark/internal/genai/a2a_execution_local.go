package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func (a *Agent) executeLocallyA2ANative(ctx context.Context, userInput protocol.Message, history []protocol.Message, _ MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if a.Model == nil {
		return nil, fmt.Errorf("agent %s has no model configured", a.FullName())
	}

	a2aProvider := NewOpenAIA2AModelAdapter(a.Model, a.Name, a.Namespace)

	agentMessages, err := a.prepareA2ANativeMessages(ctx, userInput, history)
	if err != nil {
		return nil, err
	}

	engine := NewA2ALocalEngine(a2aProvider, a.Tools, a.FullName())
	return engine.Execute(ctx, userInput, agentMessages, eventStream)
}

func (a *Agent) prepareA2ANativeMessages(ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	resolvedPrompt, err := a.resolvePrompt(ctx)
	if err != nil {
		return nil, fmt.Errorf("agent %s prompt resolution failed: %w", a.FullName(), err)
	}

	systemMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(resolvedPrompt),
		&protocol.DataPart{
			Kind: protocol.KindData,
			Data: RoleHintPayloadV1{
				Schema: A2APayloadSchemaRoleHintV1,
				Role:   RoleSystem,
			},
		},
	})

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

func convertA2AMessagesToCompatMultimodal(messages []protocol.Message) ([]Message, error) {
	compatMessages := make([]Message, 0, len(messages))
	for i := range messages {
		converted, err := A2AToOpenAIMessageMultimodal(messages[i])
		if err != nil {
			return nil, fmt.Errorf("failed to convert A2A message %d to OpenAI format: %w", i, err)
		}
		compatMessages = append(compatMessages, converted)
	}
	return compatMessages, nil
}
