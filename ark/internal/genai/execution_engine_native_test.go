package genai

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestExtractResponseMessagesNilResult(t *testing.T) {
	_, err := extractResponseMessages(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nil result")
}

func TestExtractResponseMessagesFromMessage(t *testing.T) {
	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("hello from agent"),
	})
	result := &protocol.MessageResult{Result: &msg}

	messages, err := extractResponseMessages(result)
	require.NoError(t, err)
	require.Len(t, messages, 1)
	assert.Equal(t, protocol.MessageRoleAgent, messages[0].Role)
	assert.Equal(t, "hello from agent", extractTextFromParts(messages[0].Parts))
}

func TestExtractResponseMessagesFromCompletedTask(t *testing.T) {
	statusMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("final answer"),
	})
	task := &protocol.Task{
		ID: "task-1",
		Status: protocol.TaskStatus{
			State:   TaskStateCompleted,
			Message: &statusMsg,
		},
		History: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("question")}),
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("thinking...")}),
		},
	}
	result := &protocol.MessageResult{Result: task}

	messages, err := extractResponseMessages(result)
	require.NoError(t, err)
	require.Len(t, messages, 2)
	assert.Equal(t, protocol.MessageRoleAgent, messages[0].Role)
	assert.Equal(t, "thinking...", extractTextFromParts(messages[0].Parts))
	assert.Equal(t, protocol.MessageRoleAgent, messages[1].Role)
	assert.Equal(t, "final answer", extractTextFromParts(messages[1].Parts))
}

func TestExtractResponseMessagesFromTaskNoAgentMessages(t *testing.T) {
	task := &protocol.Task{
		ID: "task-2",
		Status: protocol.TaskStatus{
			State: TaskStateCompleted,
		},
		History: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("hello")}),
		},
	}
	result := &protocol.MessageResult{Result: task}

	_, err := extractResponseMessages(result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no agent messages")
}

func TestExtractResponseMessagesUnexpectedType(t *testing.T) {
	result := &protocol.MessageResult{Result: nil}
	_, err := extractResponseMessages(result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unexpected A2A result type")
}

func TestExtractMessagesFromTaskFiltersAgentOnly(t *testing.T) {
	task := &protocol.Task{
		ID: "task-3",
		Status: protocol.TaskStatus{
			State: TaskStateCompleted,
		},
		History: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("input")}),
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("step 1")}),
			protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("follow-up")}),
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("step 2")}),
		},
	}

	messages, err := extractMessagesFromTask(task)
	require.NoError(t, err)
	require.Len(t, messages, 2)
	assert.Equal(t, "step 1", extractTextFromParts(messages[0].Parts))
	assert.Equal(t, "step 2", extractTextFromParts(messages[1].Parts))
}

func TestExtractMessagesFromTaskEmptyState(t *testing.T) {
	task := &protocol.Task{
		ID:     "task-4",
		Status: protocol.TaskStatus{},
	}

	_, err := extractMessagesFromTask(task)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no status state")
}
