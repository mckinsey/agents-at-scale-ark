package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type A2AToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type A2AToolOutcome struct {
	ToolCallID string                 `json:"toolCallId"`
	ToolName   string                 `json:"toolName"`
	Content    string                 `json:"content,omitempty"`
	Error      string                 `json:"error,omitempty"`
	TaskID     string                 `json:"taskId,omitempty"`
	ContextID  string                 `json:"contextId,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type A2ATurnUsage struct {
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64
}

type A2ATurnResult struct {
	Message   protocol.Message
	ToolCalls []A2AToolCall
	Content   string
	Usage     *A2ATurnUsage
}

type A2AModelProvider interface {
	A2ATurn(ctx context.Context, messages []protocol.Message, toolOutcomes []A2AToolOutcome, tools []A2AToolDefinition, eventStream EventStreamInterface) (*A2ATurnResult, error)
}

type A2AToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

var ErrA2AModelProviderNotSupported = fmt.Errorf("provider does not support A2A model interface")

func executeChatCompletionNativeTurn(
	ctx context.Context,
	provider ChatCompletionProvider,
	providerLabel string,
	messages []protocol.Message,
	toolOutcomes []A2AToolOutcome,
	tools []A2AToolDefinition,
) (*A2ATurnResult, error) {
	compatMessages, err := convertA2AMessagesToCompatMultimodal(messages)
	if err != nil {
		return nil, fmt.Errorf("%s native turn: failed to convert A2A messages: %w", providerLabel, err)
	}
	compatMessages = normalizeAssistantToolCallMessages(compatMessages, buildToolOutcomeContentByID(toolOutcomes))
	openAITools := a2aToolDefsToOpenAI(tools)
	response, err := provider.ChatCompletion(ctx, compatMessages, 1, openAITools)
	if err != nil {
		return nil, err
	}
	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("%s native turn: model returned empty response", providerLabel)
	}
	result, err := buildA2ATurnResultFromChatChoice(response.Choices[0], "")
	if err != nil {
		return nil, err
	}
	result.Usage = &A2ATurnUsage{
		PromptTokens:     response.Usage.PromptTokens,
		CompletionTokens: response.Usage.CompletionTokens,
		TotalTokens:      response.Usage.TotalTokens,
	}
	return result, nil
}
