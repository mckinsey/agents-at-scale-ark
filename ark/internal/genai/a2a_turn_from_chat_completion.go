package genai

import (
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
)

func buildA2ATurnResultFromChatChoice(choice openai.ChatCompletionChoice, assistantName string) (*A2ATurnResult, error) {
	content := choice.Message.Content

	assistantMsg := openai.AssistantMessage(content)
	if assistantMsg.OfAssistant != nil && assistantName != "" {
		assistantMsg.OfAssistant.Name = param.Opt[string]{Value: assistantName}
	}

	if len(choice.Message.ToolCalls) > 0 {
		toolCallParams := make([]openai.ChatCompletionMessageToolCallParam, len(choice.Message.ToolCalls))
		for i, call := range choice.Message.ToolCalls {
			args := call.Function.Arguments
			if args == "" {
				args = "{}"
			}
			toolCallParams[i] = openai.ChatCompletionMessageToolCallParam{
				ID: call.ID,
				Function: openai.ChatCompletionMessageToolCallFunctionParam{
					Name:      call.Function.Name,
					Arguments: args,
				},
			}
		}
		assistantMsg.OfAssistant.ToolCalls = toolCallParams
	}

	a2aMsg, err := OpenAIToA2AMessageMultimodal(assistantMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to convert assistant message to A2A: %w", err)
	}

	var a2aToolCalls []A2AToolCall
	for _, tc := range choice.Message.ToolCalls {
		a2aToolCalls = append(a2aToolCalls, A2AToolCall{
			ID:        tc.ID,
			Name:      tc.Function.Name,
			Arguments: tc.Function.Arguments,
		})
	}

	return &A2ATurnResult{
		Message:   a2aMsg,
		ToolCalls: a2aToolCalls,
		Content:   content,
	}, nil
}
