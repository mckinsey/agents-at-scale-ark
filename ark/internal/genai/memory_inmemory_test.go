package genai

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func TestInMemoryMemory(t *testing.T) {
	ctx := context.Background()
	k8sClient := fake.NewClientBuilder().Build()
	
	config := Config{
		SessionId:  "test-session-123",
	}
	
	// Create in-memory memory instance
	memory, err := NewInMemoryMemory(ctx, k8sClient, "test-memory", "default", nil, config)
	require.NoError(t, err)
	require.NotNil(t, memory)

	// Test adding messages
	messages := []Message{
		Message(openai.UserMessage("Hello, world!")),
		Message(openai.AssistantMessage("Hi there! How can I help you?")),
		Message(openai.UserMessage("What's the weather like?")),
	}

	err = memory.AddMessages(ctx, "query-123", messages)
	assert.NoError(t, err)

	// Test retrieving messages
	retrievedMessages, err := memory.GetMessages(ctx)
	assert.NoError(t, err)
	assert.Len(t, retrievedMessages, 3)

	// Verify message content (basic check)
	assert.NotNil(t, retrievedMessages[0])
	assert.NotNil(t, retrievedMessages[1]) 
	assert.NotNil(t, retrievedMessages[2])

	// Test adding more messages to the same session
	moreMessages := []Message{
		Message(openai.AssistantMessage("The weather is sunny today!")),
	}
	
	err = memory.AddMessages(ctx, "query-456", moreMessages)
	assert.NoError(t, err)

	// Should now have 4 messages total
	allMessages, err := memory.GetMessages(ctx)
	assert.NoError(t, err)
	assert.Len(t, allMessages, 4)

	// Test Close (should not error)
	err = memory.Close()
	assert.NoError(t, err)
}

func TestInMemoryMemoryDifferentSessions(t *testing.T) {
	ctx := context.Background()
	k8sClient := fake.NewClientBuilder().Build()

	// Create two memory instances with different session IDs
	config1 := Config{
		SessionId:  "session-1",
	}
	
	config2 := Config{
		SessionId:  "session-2", 
	}

	memory1, err := NewInMemoryMemory(ctx, k8sClient, "test-memory", "default", nil, config1)
	require.NoError(t, err)

	memory2, err := NewInMemoryMemory(ctx, k8sClient, "test-memory", "default", nil, config2)
	require.NoError(t, err)

	// Add messages to session 1
	messages1 := []Message{
		Message(openai.UserMessage("Message from session 1")),
	}
	err = memory1.AddMessages(ctx, "query-1", messages1)
	assert.NoError(t, err)

	// Add messages to session 2
	messages2 := []Message{
		Message(openai.UserMessage("Message from session 2")),
		Message(openai.AssistantMessage("Response to session 2")),
	}
	err = memory2.AddMessages(ctx, "query-2", messages2)
	assert.NoError(t, err)

	// Verify sessions are isolated
	session1Messages, err := memory1.GetMessages(ctx)
	assert.NoError(t, err)
	assert.Len(t, session1Messages, 1)

	session2Messages, err := memory2.GetMessages(ctx)
	assert.NoError(t, err)
	assert.Len(t, session2Messages, 2)
}

func TestInMemoryMemoryFactoryMethod(t *testing.T) {
	ctx := context.Background()
	k8sClient := fake.NewClientBuilder().Build()

	// Test creating in-memory memory using the factory method
	memory, err := NewInMemoryMemoryForQuery(ctx, k8sClient, "test-memory", "default", nil, "test-session")
	require.NoError(t, err)
	require.NotNil(t, memory)

	// Test basic functionality
	messages := []Message{
		Message(openai.UserMessage("Factory test message")),
	}
	
	err = memory.AddMessages(ctx, "factory-query", messages)
	assert.NoError(t, err)

	retrievedMessages, err := memory.GetMessages(ctx)
	assert.NoError(t, err)
	assert.Len(t, retrievedMessages, 1)
}

func TestInMemoryStore(t *testing.T) {
	store := NewInMemoryStore()

	// Test empty store
	assert.Equal(t, 0, store.GetSessionCount())
	assert.Len(t, store.GetAllSessions(), 0)

	// Add messages to a session
	messages := []Message{
		Message(openai.UserMessage("Test message")),
	}
	store.AddMessages("session-1", messages)

	// Verify session created
	assert.Equal(t, 1, store.GetSessionCount())
	assert.Contains(t, store.GetAllSessions(), "session-1")

	// Retrieve messages
	retrieved := store.GetMessages("session-1")
	assert.Len(t, retrieved, 1)

	// Add to different session
	store.AddMessages("session-2", messages)
	assert.Equal(t, 2, store.GetSessionCount())

	// Clear one session
	store.ClearSession("session-1")
	assert.Equal(t, 1, store.GetSessionCount())
	assert.NotContains(t, store.GetAllSessions(), "session-1")
	assert.Contains(t, store.GetAllSessions(), "session-2")
	
	// Verify session-1 is empty
	cleared := store.GetMessages("session-1")
	assert.Len(t, cleared, 0)
}