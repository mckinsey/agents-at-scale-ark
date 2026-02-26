package genai

import (
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func assistantWithToolCalls(ids ...string) Message {
	message := openai.AssistantMessage("calling tools")
	toolCalls := make([]openai.ChatCompletionMessageToolCallParam, 0, len(ids))
	for _, id := range ids {
		toolCalls = append(toolCalls, openai.ChatCompletionMessageToolCallParam{
			ID: id,
			Function: openai.ChatCompletionMessageToolCallFunctionParam{
				Name:      "lookup",
				Arguments: "{}",
			},
		})
	}
	message.OfAssistant.ToolCalls = toolCalls
	return message
}

func TestNormalizeAssistantToolCallMessagesOrdersExplicitToolsByToolCallOrder(t *testing.T) {
	messages := []Message{
		openai.UserMessage("hi"),
		assistantWithToolCalls("call-1", "call-2"),
		openai.ToolMessage(`{"value":"second"}`, "call-2"),
		openai.ToolMessage(`{"value":"first"}`, "call-1"),
	}

	normalized := normalizeAssistantToolCallMessages(messages, nil)
	require.Len(t, normalized, 4)
	require.NotNil(t, normalized[1].OfAssistant)
	require.Len(t, normalized[1].OfAssistant.ToolCalls, 2)
	assert.Equal(t, "call-1", normalized[2].OfTool.ToolCallID)
	assert.Equal(t, "call-2", normalized[3].OfTool.ToolCallID)
}

func TestNormalizeAssistantToolCallMessagesDropsUnpairedCallsWithoutFallback(t *testing.T) {
	messages := []Message{
		openai.UserMessage("hi"),
		assistantWithToolCalls("call-1", "call-2"),
		openai.ToolMessage(`{"value":"first"}`, "call-1"),
	}

	normalized := normalizeAssistantToolCallMessages(messages, nil)
	require.Len(t, normalized, 3)
	require.NotNil(t, normalized[1].OfAssistant)
	require.Len(t, normalized[1].OfAssistant.ToolCalls, 1)
	assert.Equal(t, "call-1", normalized[1].OfAssistant.ToolCalls[0].ID)
	assert.Equal(t, "call-1", normalized[2].OfTool.ToolCallID)
}

func TestNormalizeAssistantToolCallMessagesUsesFallbackForMissingToolResult(t *testing.T) {
	messages := []Message{
		openai.UserMessage("hi"),
		assistantWithToolCalls("call-1", "call-2"),
		openai.ToolMessage(`{"value":"first"}`, "call-1"),
	}

	normalized := normalizeAssistantToolCallMessages(messages, map[string]string{
		"call-2": `{"value":"second"}`,
	})
	require.Len(t, normalized, 4)
	require.NotNil(t, normalized[1].OfAssistant)
	require.Len(t, normalized[1].OfAssistant.ToolCalls, 2)
	assert.Equal(t, "call-1", normalized[2].OfTool.ToolCallID)
	assert.Equal(t, "call-2", normalized[3].OfTool.ToolCallID)
	assert.Equal(t, `{"value":"second"}`, normalized[3].OfTool.Content.OfString.Value)
}

func TestBuildToolOutcomeContentByIDSkipsEmptyIDs(t *testing.T) {
	outcomes := []A2AToolOutcome{
		{ToolCallID: "call-1", Content: `{"ok":true}`},
		{ToolCallID: "", Content: `{"ok":false}`},
	}

	contentByID := buildToolOutcomeContentByID(outcomes)
	require.Len(t, contentByID, 1)
	assert.Equal(t, `{"ok":true}`, contentByID["call-1"])
}
