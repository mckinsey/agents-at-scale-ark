package genai

import (
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/require"
)

func TestProcessAssistantMessagePreservesToolCallFunctionName(t *testing.T) {
	agent := &Agent{Name: "workspace-assistant"}
	choice := openai.ChatCompletionChoice{
		Message: openai.ChatCompletionMessage{
			Content: "",
			ToolCalls: []openai.ChatCompletionMessageToolCall{
				{
					ID: "call-1",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "filesystem-list-directory",
						Arguments: `{"path":"issues"}`,
					},
					Type: "function",
				},
			},
		},
	}

	msg := agent.processAssistantMessage(choice)
	require.NotNil(t, msg.OfAssistant)
	require.Len(t, msg.OfAssistant.ToolCalls, 1)
	require.Equal(t, "call-1", msg.OfAssistant.ToolCalls[0].ID)
	require.Equal(t, "filesystem-list-directory", msg.OfAssistant.ToolCalls[0].Function.Name)
	require.Equal(t, `{"path":"issues"}`, msg.OfAssistant.ToolCalls[0].Function.Arguments)
}

