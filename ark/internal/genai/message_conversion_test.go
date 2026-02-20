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
	toolCallsPayload, hasToolCallsPayload := extractDataPayloadBySchema(
		a2a.Parts,
		A2APayloadSchemaToolCallsV1,
	)
	require.True(t, hasToolCallsPayload)
	require.NotNil(t, toolCallsPayload["toolCalls"])

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

func TestToolCallRoundTripMarshalSafe(t *testing.T) {
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

	a2aMessage, err := OpenAIToA2AMessage(assistant)
	require.NoError(t, err)

	recovered, err := A2AToOpenAIMessage(a2aMessage)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfAssistant)
	require.Len(t, recovered.OfAssistant.ToolCalls, 1)

	_, marshalErr := json.Marshal(recovered)
	require.NoError(t, marshalErr, "recovered assistant message with tool calls must be JSON-marshalable")

	assert.Equal(t, "call-1", recovered.OfAssistant.ToolCalls[0].ID)
	assert.Equal(t, "get_weather", recovered.OfAssistant.ToolCalls[0].Function.Name)
	assert.Equal(t, `{"city":"london"}`, recovered.OfAssistant.ToolCalls[0].Function.Arguments)
}

func TestToolCallRoundTripViaSerialization(t *testing.T) {
	assistant := openai.AssistantMessage("thinking")
	assistant.OfAssistant.ToolCalls = []openai.ChatCompletionMessageToolCallParam{
		{
			ID:   "call-2",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunctionParam{
				Name:      "read_file",
				Arguments: `{"path":"/tmp/test.txt"}`,
			},
		},
	}

	a2aMessage, err := OpenAIToA2AMessage(assistant)
	require.NoError(t, err)

	serialized, err := json.Marshal(a2aMessage)
	require.NoError(t, err)

	var deserialized protocol.Message
	require.NoError(t, json.Unmarshal(serialized, &deserialized))

	recovered, err := A2AToOpenAIMessage(deserialized)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfAssistant)
	require.Len(t, recovered.OfAssistant.ToolCalls, 1)

	_, marshalErr := json.Marshal(recovered)
	require.NoError(t, marshalErr, "tool calls recovered after JSON round-trip must be marshalable")

	assert.Equal(t, "call-2", recovered.OfAssistant.ToolCalls[0].ID)
	assert.Equal(t, "read_file", recovered.OfAssistant.ToolCalls[0].Function.Name)
	assert.Equal(t, `{"path":"/tmp/test.txt"}`, recovered.OfAssistant.ToolCalls[0].Function.Arguments)
}

func TestA2AToOpenAIMessageUsesToolResultPayloadRole(t *testing.T) {
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("tool output"),
		&protocol.DataPart{
			Data: ToolResultPayloadV1{
				Schema:     A2APayloadSchemaToolResultV1,
				ToolCallID: "call-ext-1",
				Content:    "tool output",
			},
		},
	})

	recovered, err := A2AToOpenAIMessage(message)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfTool)
	assert.Equal(t, "tool output", recovered.OfTool.Content.OfString.Value)
	assert.Equal(t, "call-ext-1", recovered.OfTool.ToolCallID)
}

func TestA2AToOpenAIMessageUsesRoleHintPayload(t *testing.T) {
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("legacy tool output"),
		&protocol.DataPart{
			Data: RoleHintPayloadV1{
				Schema: A2APayloadSchemaRoleHintV1,
				Role:   RoleSystem,
			},
		},
	})

	recovered, err := A2AToOpenAIMessage(message)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfSystem)
	assert.Equal(t, "legacy tool output", recovered.OfSystem.Content.OfString.Value)
}

func TestA2AToOpenAIMessageExperimentalPreservesImageFileParts(t *testing.T) {
	message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("describe image"),
		protocol.NewFilePartWithURI("diagram.png", "image/png", "https://example.com/diagram.png"),
	})

	recovered, err := A2AToOpenAIMessageExperimental(message)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfUser)
	require.Len(t, recovered.OfUser.Content.OfArrayOfContentParts, 2)
	require.NotNil(t, recovered.OfUser.Content.OfArrayOfContentParts[0].OfText)
	assert.Equal(t, "describe image", recovered.OfUser.Content.OfArrayOfContentParts[0].OfText.Text)
	require.NotNil(t, recovered.OfUser.Content.OfArrayOfContentParts[1].OfImageURL)
	assert.Equal(t, "https://example.com/diagram.png", recovered.OfUser.Content.OfArrayOfContentParts[1].OfImageURL.ImageURL.URL)
}

func TestA2AToOpenAIMessageExperimentalConvertsImageBytesToDataURL(t *testing.T) {
	message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewFilePartWithBytes("image.png", "image/png", "YWJj"),
	})

	recovered, err := A2AToOpenAIMessageExperimental(message)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfUser)
	require.Len(t, recovered.OfUser.Content.OfArrayOfContentParts, 1)
	require.NotNil(t, recovered.OfUser.Content.OfArrayOfContentParts[0].OfImageURL)
	assert.Equal(t, "data:image/png;base64,YWJj", recovered.OfUser.Content.OfArrayOfContentParts[0].OfImageURL.ImageURL.URL)
}

func TestDefaultA2AToOpenAIMessageRemainsTextOnlyForImageFilePart(t *testing.T) {
	message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("keep text"),
		protocol.NewFilePartWithURI("keep.png", "image/png", "https://example.com/keep.png"),
	})

	recovered, err := A2AToOpenAIMessage(message)
	require.NoError(t, err)
	require.NotNil(t, recovered.OfUser)
	assert.Equal(t, extractTextFromParts(message.Parts), recovered.OfUser.Content.OfString.Value)
	assert.Len(t, recovered.OfUser.Content.OfArrayOfContentParts, 0)
}

func TestOpenAIToA2AMessageExperimentalPreservesImageURLParts(t *testing.T) {
	message := openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
		openai.TextContentPart("please inspect"),
		openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
			URL: "data:image/png;base64,YWJj",
		}),
	})

	recovered, err := OpenAIToA2AMessageExperimental(message)
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleUser, recovered.Role)
	require.Len(t, recovered.Parts, 2)

	textPart, ok := recovered.Parts[0].(protocol.TextPart)
	require.True(t, ok)
	assert.Equal(t, "please inspect", textPart.Text)

	filePart, ok := recovered.Parts[1].(protocol.FilePart)
	require.True(t, ok)
	fileWithURI, ok := filePart.File.(*protocol.FileWithURI)
	require.True(t, ok)
	assert.Equal(t, "data:image/png;base64,YWJj", fileWithURI.URI)
	require.NotNil(t, fileWithURI.MimeType)
	assert.Equal(t, "image/png", *fileWithURI.MimeType)
}

func TestDefaultOpenAIToA2AMessageRemainsTextOnlyForImageURL(t *testing.T) {
	message := openai.UserMessage([]openai.ChatCompletionContentPartUnionParam{
		openai.TextContentPart("keep text"),
		openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
			URL: "https://example.com/keep.png",
		}),
	})

	recovered, err := OpenAIToA2AMessage(message)
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleUser, recovered.Role)
	require.Len(t, recovered.Parts, 1)
	assert.Equal(t, "keep text", extractTextFromParts(recovered.Parts))
}
