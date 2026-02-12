package genai

import (
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestRoundTripUserMessage(t *testing.T) {
	original := openai.UserMessage("hello world")
	a2a, err := OpenAIToA2AMessage(original)
	require.NoError(t, err)

	recovered, err := A2AToOpenAIMessage(a2a)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfUser)
	assert.Equal(t, "hello world", recovered.OfUser.Content.OfString.Value)
}

func TestRoundTripAssistantMessage(t *testing.T) {
	original := openai.AssistantMessage("I can help")
	a2a, err := OpenAIToA2AMessage(original)
	require.NoError(t, err)

	recovered, err := A2AToOpenAIMessage(a2a)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfAssistant)
	assert.Equal(t, "I can help", recovered.OfAssistant.Content.OfString.Value)
}

func TestRoundTripSystemMessage(t *testing.T) {
	original := openai.SystemMessage("you are helpful")
	a2a, err := OpenAIToA2AMessage(original)
	require.NoError(t, err)

	recovered, err := A2AToOpenAIMessage(a2a)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfSystem)
	assert.Equal(t, "you are helpful", recovered.OfSystem.Content.OfString.Value)
}

func TestRoundTripToolMessage(t *testing.T) {
	original := openai.ToolMessage("result", "call-123")
	a2a, err := OpenAIToA2AMessage(original)
	require.NoError(t, err)

	recovered, err := A2AToOpenAIMessage(a2a)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfTool)
	assert.Equal(t, "result", recovered.OfTool.Content.OfString.Value)
	assert.Equal(t, "call-123", recovered.OfTool.ToolCallID)
}

func TestToolCallsSurviveJSONRoundTrip(t *testing.T) {
	assistant := openai.AssistantMessage("thinking")
	assistant.OfAssistant.ToolCalls = []openai.ChatCompletionMessageToolCallParam{
		{
			ID:   "call-1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunctionParam{
				Name:      "get_weather",
				Arguments: `{"city":"london"}`,
			},
		},
	}

	a2a, err := OpenAIToA2AMessage(assistant)
	require.NoError(t, err)
	require.NotNil(t, a2a.Metadata)
	require.NotNil(t, a2a.Metadata[MetadataToolCallsKey])

	raw, err := json.Marshal(a2a)
	require.NoError(t, err)

	var deserialized protocol.Message
	require.NoError(t, json.Unmarshal(raw, &deserialized))

	recovered, err := A2AToOpenAIMessage(deserialized)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfAssistant)
	require.Len(t, recovered.OfAssistant.ToolCalls, 1)
	assert.Equal(t, "call-1", recovered.OfAssistant.ToolCalls[0].ID)
	assert.Equal(t, "get_weather", recovered.OfAssistant.ToolCalls[0].Function.Name)
	assert.Equal(t, `{"city":"london"}`, recovered.OfAssistant.ToolCalls[0].Function.Arguments)
}

func TestMemoryFormatBackwardsCompatibility(t *testing.T) {
	oldFormat := `{"role":"user","content":"hello from old format"}`
	var raw json.RawMessage = []byte(oldFormat)

	msg, err := unmarshalMessageRobust(raw)
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleUser, msg.Role)
	assert.Equal(t, "hello from old format", extractTextFromParts(msg.Parts))
}

func TestMemoryFormatNewA2AMessages(t *testing.T) {
	a2aMsg := NewUserMessage("hello from a2a")
	raw, err := json.Marshal(a2aMsg)
	require.NoError(t, err)

	msg, err := unmarshalMessageRobust(json.RawMessage(raw))
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleUser, msg.Role)
	assert.Equal(t, "hello from a2a", extractTextFromParts(msg.Parts))
}

func TestMemoryFormatOldAssistantWithToolCalls(t *testing.T) {
	oldFormat := `{"role":"assistant","content":"let me check"}`
	var raw json.RawMessage = []byte(oldFormat)

	msg, err := unmarshalMessageRobust(raw)
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleAgent, msg.Role)
	assert.Equal(t, "let me check", extractTextFromParts(msg.Parts))
}

func TestSerializeMessagesProducesOpenAIFormat(t *testing.T) {
	messages := []Message{
		NewUserMessage("question"),
		NewAssistantMessage("answer"),
		NewSystemMessage("system prompt"),
		ToolMessage("tool output", "call-1"),
	}

	openaiMessages := make([]interface{}, 0, len(messages))
	for _, msg := range messages {
		openaiMessages = append(openaiMessages, msg)
	}

	raw, err := json.Marshal(openaiMessages)
	require.NoError(t, err)

	var decoded []map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &decoded))
	require.Len(t, decoded, 4)

	assert.Equal(t, "user", decoded[0]["role"])
	assert.Equal(t, "assistant", decoded[1]["role"])
	assert.Equal(t, "system", decoded[2]["role"])
	assert.Equal(t, "tool", decoded[3]["role"])
}
