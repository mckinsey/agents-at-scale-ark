package genai

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestConvertA2AInputToCompatMessages(t *testing.T) {
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})
	history := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("previous"),
		}),
	}

	compatUser, compatHistory, err := convertA2AInputToCompatMessages(userInput, history)
	require.NoError(t, err)
	assert.Equal(t, RoleUser, resolveMessageRole(compatUser))
	assert.Equal(t, "hello", ExtractTextFromMessage(compatUser))
	require.Len(t, compatHistory, 1)
	assert.Equal(t, RoleAssistant, resolveMessageRole(compatHistory[0]))
	assert.Equal(t, "previous", ExtractTextFromMessage(compatHistory[0]))
}

func TestConvertCompatMessagesToA2AAddsContextAndTask(t *testing.T) {
	messages := []Message{
		NewAssistantMessage("answer"),
	}

	converted, err := convertCompatMessagesToA2A(messages, "ctx-1", "task-1")
	require.NoError(t, err)
	require.Len(t, converted, 1)
	assert.Equal(t, protocol.MessageRoleAgent, converted[0].Role)
	require.NotNil(t, converted[0].ContextID)
	assert.Equal(t, "ctx-1", *converted[0].ContextID)
	require.NotNil(t, converted[0].TaskID)
	assert.Equal(t, "task-1", *converted[0].TaskID)
}

func TestResolveA2AMetadataFromInputUsesMessageValues(t *testing.T) {
	ctx := context.Background()
	ctx = WithQueryContext(ctx, "query-id", "session-id", "query-name")
	ctx = WithA2AContextID(ctx, "ctx-context")
	messageContextID := "ctx-message"
	messageTaskID := "task-message"
	userInput := protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	}, &messageTaskID, &messageContextID)

	contextID, taskID := resolveA2AMetadataFromInput(ctx, userInput)
	assert.Equal(t, "ctx-message", contextID)
	assert.Equal(t, "task-message", taskID)
}

func TestResolveA2AMetadataFromInputFallsBackToContext(t *testing.T) {
	ctx := context.Background()
	ctx = WithQueryContext(ctx, "query-id", "session-id", "query-name")
	ctx = WithA2AContextID(ctx, "ctx-context")
	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	contextID, taskID := resolveA2AMetadataFromInput(ctx, userInput)
	assert.Equal(t, "ctx-context", contextID)
	assert.Equal(t, "query-id", taskID)
}

func TestStreamNativeA2AMessageStrict(t *testing.T) {
	stream := &fakeEventStream{}
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("done"),
	})

	err := streamNativeA2AMessageStrict(context.Background(), stream, message, "test")
	require.NoError(t, err)

	require.Len(t, stream.chunks, 1)
	streamedMessage, ok := stream.chunks[0].(*protocol.Message)
	require.True(t, ok)
	assert.Equal(t, "done", ExtractA2ATextFromMessage(*streamedMessage))
}

func TestCompatToolCallMetadataRoundTrip(t *testing.T) {
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
	assert.Equal(t, "call-1", recovered.OfAssistant.ToolCalls[0].ID)
	assert.Equal(t, "get_weather", recovered.OfAssistant.ToolCalls[0].Function.Name)
	assert.Equal(t, `{"city":"london"}`, recovered.OfAssistant.ToolCalls[0].Function.Arguments)
}
