package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"mckinsey.com/ark/internal/genai"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type recordingMemory struct {
	addMessagesCalled    bool
	addA2AMessagesCalled bool
	messages             []genai.Message
	a2aMessages          []protocol.Message
}

func (m *recordingMemory) AddMessages(_ context.Context, _ string, messages []genai.Message) error {
	m.addMessagesCalled = true
	m.messages = append([]genai.Message{}, messages...)
	return nil
}

func (m *recordingMemory) GetMessages(context.Context) ([]genai.Message, error) {
	return nil, nil
}

func (m *recordingMemory) AddA2AMessages(_ context.Context, _ string, messages []protocol.Message) error {
	m.addA2AMessagesCalled = true
	m.a2aMessages = append([]protocol.Message{}, messages...)
	return nil
}

func (m *recordingMemory) GetA2AMessages(context.Context) ([]protocol.Message, error) {
	return nil, nil
}

func (m *recordingMemory) Close() error {
	return nil
}

func TestExecutionResultToCompatMessagesFromA2A(t *testing.T) {
	a2aMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("native output"),
	})
	result := &genai.ExecutionResult{
		A2AMessages: []protocol.Message{a2aMessage},
	}

	compatMessages, err := executionResultToCompatMessages(result)
	require.NoError(t, err)
	require.Len(t, compatMessages, 1)
	require.NotNil(t, compatMessages[0].OfAssistant)
	assert.Equal(t, "native output", compatMessages[0].OfAssistant.Content.OfString.Value)
}

func TestExecutionResultToCompatMessagesFromA2AResponseContent(t *testing.T) {
	result := &genai.ExecutionResult{
		A2AResponse: &genai.A2AResponse{
			Content: "response content",
		},
	}

	compatMessages, err := executionResultToCompatMessages(result)
	require.NoError(t, err)
	require.Len(t, compatMessages, 1)
	require.NotNil(t, compatMessages[0].OfAssistant)
	assert.Equal(t, "response content", compatMessages[0].OfAssistant.Content.OfString.Value)
}

func TestExtractA2AMetadataFromExecutionResultUsesMessageFallback(t *testing.T) {
	contextID := "ctx-1"
	taskID := "task-1"
	a2aMessage := protocol.NewMessageWithContext(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("done"),
	}, &taskID, &contextID)
	result := &genai.ExecutionResult{
		A2AMessages: []protocol.Message{a2aMessage},
	}

	metadata := extractA2AMetadataFromExecutionResult(result)
	require.NotNil(t, metadata)
	assert.Equal(t, contextID, metadata.ContextID)
	assert.Equal(t, taskID, metadata.TaskID)
}

func TestSaveExecutionResultToMemoryPrefersA2A(t *testing.T) {
	memory := &recordingMemory{}
	inputMessages := []genai.Message{
		genai.NewUserMessage("hello"),
	}
	a2aMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("native output"),
	})
	result := &genai.ExecutionResult{
		A2AMessages: []protocol.Message{a2aMessage},
	}

	err := saveExecutionResultToMemory(context.Background(), memory, "query-1", inputMessages, result)
	require.NoError(t, err)
	assert.True(t, memory.addA2AMessagesCalled)
	assert.False(t, memory.addMessagesCalled)
	require.Len(t, memory.a2aMessages, 2)
	assert.Equal(t, protocol.MessageRoleUser, memory.a2aMessages[0].Role)
	assert.Equal(t, protocol.MessageRoleAgent, memory.a2aMessages[1].Role)
}

func TestSaveExecutionResultToMemoryFallsBackToCompat(t *testing.T) {
	memory := &recordingMemory{}
	inputMessages := []genai.Message{
		genai.NewUserMessage("hello"),
	}
	responseMessages := []genai.Message{
		genai.NewAssistantMessage("compat output"),
	}
	result := &genai.ExecutionResult{
		Messages: responseMessages,
	}

	err := saveExecutionResultToMemory(context.Background(), memory, "query-1", inputMessages, result)
	require.NoError(t, err)
	assert.True(t, memory.addMessagesCalled)
	assert.False(t, memory.addA2AMessagesCalled)
	require.Len(t, memory.messages, 2)
	assert.Equal(t, "compat output", memory.messages[1].OfAssistant.Content.OfString.Value)
}
