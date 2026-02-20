package genai

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestConvertA2AMessagesToBedrockNativePairsAssistantToolCallsWithOutcomes(t *testing.T) {
	system := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("system prompt"),
		&protocol.DataPart{
			Kind: protocol.KindData,
			Data: RoleHintPayloadV1{
				Schema: A2APayloadSchemaRoleHintV1,
				Role:   RoleSystem,
			},
		},
	})
	user := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("user asks"),
	})
	assistantWithToolCall := protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart([]protocol.Part{
		protocol.NewTextPart("calling tool"),
	}, ToolCallsPayloadV1{
		Schema: A2APayloadSchemaToolCallsV1,
		ToolCalls: []ToolCallPayloadV1{
			{
				ID:        "call-1",
				Name:      "lookup",
				Arguments: `{"city":"london"}`,
			},
		},
	}))

	messages, systemPrompt := convertA2AMessagesToBedrockNative(
		[]protocol.Message{system, user, assistantWithToolCall},
		[]A2AToolOutcome{
			{
				ToolCallID: "call-1",
				Content:    `{"schema":"https://ark.mckinsey.com/payloads/tool-result/v1","content":"tool result"}`,
			},
		},
	)

	assert.Equal(t, "system prompt", systemPrompt)
	require.Len(t, messages, 3)
	assert.Equal(t, RoleUser, messages[0].Role)
	assert.Equal(t, "user asks", messages[0].Content)
	assert.Equal(t, RoleAssistant, messages[1].Role)
	assert.Equal(t, "calling tool", messages[1].Content)
	assert.Equal(t, RoleUser, messages[2].Role)
	assert.Contains(t, messages[2].Content, `"tool result"`)
}

func TestConvertBedrockResponseToA2ATurnResultIncludesToolCallsPayload(t *testing.T) {
	result := convertBedrockResponseToA2ATurnResult(bedrockResponse{
		Content: []bedrockContent{
			{
				Type: "text",
				Text: "thinking complete",
			},
			{
				Type: "tool_use",
				ID:   "call-1",
				Name: "lookup",
				Input: map[string]interface{}{
					"city": "london",
				},
			},
		},
	})

	require.NotNil(t, result)
	assert.Equal(t, "thinking complete", result.Content)
	require.Len(t, result.ToolCalls, 1)
	assert.Equal(t, "call-1", result.ToolCalls[0].ID)
	assert.Equal(t, "lookup", result.ToolCalls[0].Name)
	assert.Contains(t, result.ToolCalls[0].Arguments, `"city":"london"`)
	payload, ok := extractDataPayloadBySchema(result.Message.Parts, A2APayloadSchemaToolCallsV1)
	require.True(t, ok)
	require.Contains(t, payload, "toolCalls")
}

func TestBuildA2AToolOutcomeContentByIDUsesFallbackContentOrder(t *testing.T) {
	contentByID := buildA2AToolOutcomeContentByID([]A2AToolOutcome{
		{
			ToolCallID: "call-content",
			Content:    "content-first",
			Error:      "ignored-error",
			Metadata:   map[string]interface{}{"contextId": "ctx-a"},
		},
		{
			ToolCallID: "call-error",
			Error:      "error-second",
			Metadata:   map[string]interface{}{"contextId": "ctx-b"},
		},
		{
			ToolCallID: "call-metadata",
			Metadata:   map[string]interface{}{"contextId": "ctx-c"},
		},
		{
			ToolCallID: "call-empty",
		},
	})

	require.Len(t, contentByID, 4)
	assert.Equal(t, "content-first", contentByID["call-content"])
	assert.Equal(t, "error-second", contentByID["call-error"])
	assert.JSONEq(t, `{"contextId":"ctx-c"}`, contentByID["call-metadata"])
	assert.Equal(t, "{}", contentByID["call-empty"])
}
