package genai

import (
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestChatCompletionsAdapterRoundTrip(t *testing.T) {
	adapter := &ChatCompletionsAdapter{}
	assert.Equal(t, "chat-completions", adapter.Name())

	original := openai.UserMessage("hello world")
	a2aMsg, err := adapter.ToA2A(original)
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleUser, a2aMsg.Role)
	assert.Equal(t, "hello world", extractTextFromParts(a2aMsg.Parts))

	back, err := adapter.FromA2A(a2aMsg)
	require.NoError(t, err)
	result, ok := back.(openai.ChatCompletionMessageParamUnion)
	require.True(t, ok)
	require.NotNil(t, result.OfUser)
}

func TestChatCompletionsAdapterAssistantRoundTrip(t *testing.T) {
	adapter := &ChatCompletionsAdapter{}

	original := openai.AssistantMessage("response text")
	a2aMsg, err := adapter.ToA2A(original)
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleAgent, a2aMsg.Role)

	back, err := adapter.FromA2A(a2aMsg)
	require.NoError(t, err)
	result, ok := back.(openai.ChatCompletionMessageParamUnion)
	require.True(t, ok)
	require.NotNil(t, result.OfAssistant)
}

func TestChatCompletionsAdapterInvalidInput(t *testing.T) {
	adapter := &ChatCompletionsAdapter{}
	_, err := adapter.ToA2A("not-a-union")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expected openai.ChatCompletionMessageParamUnion")
}

func TestResponseAPIAdapterToA2A(t *testing.T) {
	adapter := &ResponseAPIAdapter{}
	assert.Equal(t, "response-api", adapter.Name())

	msg, err := adapter.ToA2A("hello from response api")
	require.NoError(t, err)
	assert.Equal(t, protocol.MessageRoleUser, msg.Role)
	assert.Equal(t, "hello from response api", extractTextFromParts(msg.Parts))
}

func TestResponseAPIAdapterFromA2A(t *testing.T) {
	adapter := &ResponseAPIAdapter{}

	taskID := "task-123"
	a2aMsg := protocol.NewMessageWithContext(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("generated output"),
	}, &taskID, nil)

	result, err := adapter.FromA2A(a2aMsg)
	require.NoError(t, err)

	item, ok := result.(ResponseAPIItem)
	require.True(t, ok)
	assert.Equal(t, "message", item.Type)
	assert.Equal(t, "assistant", item.Role)
	assert.Equal(t, "task-123", item.ID)
	require.Len(t, item.Content, 1)
	assert.Equal(t, "output_text", item.Content[0].Type)
	assert.Equal(t, "generated output", item.Content[0].Text)
}

func TestResponseAPIAdapterInvalidInput(t *testing.T) {
	adapter := &ResponseAPIAdapter{}
	_, err := adapter.ToA2A(42)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expected string input")
}

func TestGetEdgeAdapter(t *testing.T) {
	cc, err := GetEdgeAdapter("chat-completions")
	require.NoError(t, err)
	assert.Equal(t, "chat-completions", cc.Name())

	ra, err := GetEdgeAdapter("response-api")
	require.NoError(t, err)
	assert.Equal(t, "response-api", ra.Name())

	_, err = GetEdgeAdapter("unknown")
	assert.Error(t, err)
}

func TestMapA2ARoleToResponseAPI(t *testing.T) {
	assert.Equal(t, "assistant", mapA2ARoleToResponseAPI(protocol.MessageRoleAgent))
	assert.Equal(t, "user", mapA2ARoleToResponseAPI(protocol.MessageRoleUser))
	assert.Equal(t, "assistant", mapA2ARoleToResponseAPI("unknown"))
}
