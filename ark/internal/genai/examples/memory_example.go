package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/openai/openai-go"
	"mckinsey.com/ark/internal/genai"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

// MockEventEmitter is a simple no-op implementation of EventEmitter for examples
type MockEventEmitter struct{}

func (m *MockEventEmitter) EmitEvent(ctx context.Context, eventType, reason string, data genai.EventData) {
	// No-op for example purposes
}

func main() {
	ctx := context.Background()
	k8sClient := fake.NewClientBuilder().Build()

	fmt.Println("=== ARK Memory Store Examples ===\n")

	// Example 1: In-Memory Storage
	fmt.Println("1. In-Memory Memory Store")
	inMemoryExample(ctx, k8sClient)

	fmt.Println("\n" + strings.Repeat("=", 50) + "\n")

	// Example 2: NoOp Storage
	fmt.Println("2. NoOp Memory Store")
	noopExample(ctx, k8sClient)
}

func inMemoryExample(ctx context.Context, k8sClient client.Client) {
	// Create in-memory memory configuration
	config := genai.Config{
		SessionId:  "chat-session-12345",
	}

	// Create a mock event emitter for the example
	mockEmitter := &MockEventEmitter{}

	// Create memory instance
	memory, err := genai.NewInMemoryMemory(ctx, k8sClient, "demo-memory", "default", mockEmitter, config)
	if err != nil {
		log.Fatalf("Failed to create in-memory memory: %v", err)
	}
	defer memory.Close()

	// Add some conversation messages
	messages := []genai.Message{
		genai.Message(openai.UserMessage("Hello, I need help with my project")),
		genai.Message(openai.AssistantMessage("I'd be happy to help! What kind of project are you working on?")),
		genai.Message(openai.UserMessage("It's a Go application using the ARK framework")),
		genai.Message(openai.AssistantMessage("Great! ARK is a powerful framework. What specific aspect do you need help with?")),
	}

	// Store messages
	err = memory.AddMessages(ctx, "query-001", messages)
	if err != nil {
		log.Fatalf("Failed to add messages: %v", err)
	}

	fmt.Printf("✓ Added %d messages to session: %s\n", len(messages), config.SessionId)

	// Retrieve messages
	retrievedMessages, err := memory.GetMessages(ctx)
	if err != nil {
		log.Fatalf("Failed to get messages: %v", err)
	}

	fmt.Printf("✓ Retrieved %d messages from session\n", len(retrievedMessages))

	// Add more messages to simulate continuing conversation
	moreMessages := []genai.Message{
		genai.Message(openai.UserMessage("I'm having trouble with memory configuration")),
		genai.Message(openai.AssistantMessage("I can help with that! There are three memory types available: HTTP, in-memory, and noop.")),
	}

	err = memory.AddMessages(ctx, "query-002", moreMessages)
	if err != nil {
		log.Fatalf("Failed to add more messages: %v", err)
	}

	// Get final message count
	allMessages, _ := memory.GetMessages(ctx)
	fmt.Printf("✓ Total conversation now has %d messages\n", len(allMessages))
	fmt.Printf("✓ Messages are stored in RAM (non-persistent)\n")
}

func noopExample(ctx context.Context, k8sClient client.Client) {
	// Create noop memory (no storage)
	config := genai.Config{
		SessionId:  "temp-session",
	}

	memory, err := genai.NewMemoryWithConfig(ctx, k8sClient, "noop-memory", "default", nil, config)
	if err != nil {
		log.Fatalf("Failed to create noop memory: %v", err)
	}
	defer memory.Close()

	// Try to add messages (will be discarded)
	messages := []genai.Message{
		genai.Message(openai.UserMessage("This message will be discarded")),
		genai.Message(openai.AssistantMessage("This response will also be discarded")),
	}

	err = memory.AddMessages(ctx, "temp-query", messages)
	if err != nil {
		log.Fatalf("Failed to add messages: %v", err)
	}

	fmt.Printf("✓ 'Added' %d messages to noop memory (actually discarded)\n", len(messages))

	// Retrieve messages (will always return empty)
	retrievedMessages, err := memory.GetMessages(ctx)
	if err != nil {
		log.Fatalf("Failed to get messages: %v", err)
	}

	fmt.Printf("✓ Retrieved %d messages from noop memory (always empty)\n", len(retrievedMessages))
	fmt.Printf("✓ Noop memory is useful for testing or when storage is not needed\n")
}
