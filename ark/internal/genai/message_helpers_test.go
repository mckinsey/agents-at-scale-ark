/* Copyright 2025. McKinsey & Company */

package genai

import (
	"reflect"
	"testing"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

// Test constants to avoid duplication
const (
	testContentHello          = "Hello"
	testContentSystem         = "You are a helpful assistant"
	testContentPrevQuestion   = "Previous question"
	testContentPrevAnswer     = "Previous answer"
	testContentCurrent        = "Current message"
	testContentFirst          = "First message"
	testContentSecond         = "Second message"
	testContentSystemPrompt   = "System prompt"
	testContentSingleQuestion = "Single question"
	testContentSingleAnswer   = "Single answer"
)

// Helper function to create test messages
func createTestMessage(role, content string) Message {
	switch role {
	case "user":
		return NewUserMessage(content)
	case "assistant":
		return NewAssistantMessage(content)
	case "system":
		return NewSystemMessage(content)
	default:
		panic("unsupported role: " + role)
	}
}

func messageSignature(message Message) string {
	return resolveMessageRole(message) + ":" + ExtractTextFromMessage(message)
}

func messagesSignature(messages []Message) []string {
	signatures := make([]string, len(messages))
	for i, message := range messages {
		signatures[i] = messageSignature(message)
	}
	return signatures
}

func TestPrepareExecutionMessages(t *testing.T) {
	tests := []struct {
		name           string
		inputMessages  []Message
		memoryMessages []Message
		wantCurrent    Message
		wantContext    []Message
	}{
		{
			name: "single input message with memory",
			inputMessages: []Message{
				createTestMessage("user", testContentHello),
			},
			memoryMessages: []Message{
				createTestMessage("system", testContentSystem),
				createTestMessage("user", testContentPrevQuestion),
				createTestMessage("assistant", testContentPrevAnswer),
			},
			wantCurrent: createTestMessage("user", testContentHello),
			wantContext: []Message{
				createTestMessage("system", testContentSystem),
				createTestMessage("user", testContentPrevQuestion),
				createTestMessage("assistant", testContentPrevAnswer),
			},
		},
		{
			name: "multiple input messages with memory",
			inputMessages: []Message{
				createTestMessage("user", testContentFirst),
				createTestMessage("user", testContentSecond),
				createTestMessage("user", testContentCurrent),
			},
			memoryMessages: []Message{
				createTestMessage("system", testContentSystemPrompt),
			},
			wantCurrent: createTestMessage("user", testContentCurrent),
			wantContext: []Message{
				createTestMessage("system", testContentSystemPrompt),
				createTestMessage("user", testContentFirst),
				createTestMessage("user", testContentSecond),
			},
		},
		{
			name: "single input message with empty memory",
			inputMessages: []Message{
				createTestMessage("user", "Only message"),
			},
			memoryMessages: []Message{},
			wantCurrent:    createTestMessage("user", "Only message"),
			wantContext:    []Message{},
		},
		{
			name: "multiple input messages with empty memory",
			inputMessages: []Message{
				createTestMessage("user", "First"),
				createTestMessage("user", "Second"),
				createTestMessage("user", "Third"),
			},
			memoryMessages: []Message{},
			wantCurrent:    createTestMessage("user", "Third"),
			wantContext: []Message{
				createTestMessage("user", "First"),
				createTestMessage("user", "Second"),
			},
		},
		{
			name: "mixed message types",
			inputMessages: []Message{
				createTestMessage("user", "Question"),
				createTestMessage("assistant", "Answer"),
				createTestMessage("user", "Follow-up"),
			},
			memoryMessages: []Message{
				createTestMessage("system", "System"),
				createTestMessage("user", "Memory question"),
			},
			wantCurrent: createTestMessage("user", "Follow-up"),
			wantContext: []Message{
				createTestMessage("system", "System"),
				createTestMessage("user", "Memory question"),
				createTestMessage("user", "Question"),
				createTestMessage("assistant", "Answer"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotCurrent, gotContext := PrepareExecutionMessages(tt.inputMessages, tt.memoryMessages)

			if messageSignature(gotCurrent) != messageSignature(tt.wantCurrent) {
				t.Errorf("PrepareExecutionMessages() current message = %v, want %v", gotCurrent, tt.wantCurrent)
			}

			if !reflect.DeepEqual(messagesSignature(gotContext), messagesSignature(tt.wantContext)) {
				t.Errorf("PrepareExecutionMessages() context messages = %v, want %v", gotContext, tt.wantContext)
			}

			// Verify that context has the expected capacity
			expectedCap := len(tt.memoryMessages) + len(tt.inputMessages) - 1
			if cap(gotContext) < expectedCap {
				t.Errorf("PrepareExecutionMessages() context capacity = %d, want at least %d", cap(gotContext), expectedCap)
			}
		})
	}
}

func TestPrepareModelMessages(t *testing.T) {
	tests := []struct {
		name           string
		inputMessages  []Message
		memoryMessages []Message
		want           []Message
	}{
		{
			name: "input and memory messages",
			inputMessages: []Message{
				createTestMessage("user", "Current question"),
				createTestMessage("assistant", "Current answer"),
			},
			memoryMessages: []Message{
				createTestMessage("system", testContentSystemPrompt),
				createTestMessage("user", testContentPrevQuestion),
				createTestMessage("assistant", testContentPrevAnswer),
			},
			want: []Message{
				createTestMessage("system", testContentSystemPrompt),
				createTestMessage("user", testContentPrevQuestion),
				createTestMessage("assistant", testContentPrevAnswer),
				createTestMessage("user", "Current question"),
				createTestMessage("assistant", "Current answer"),
			},
		},
		{
			name: "empty memory messages",
			inputMessages: []Message{
				createTestMessage("user", "First"),
				createTestMessage("user", "Second"),
			},
			memoryMessages: []Message{},
			want: []Message{
				createTestMessage("user", "First"),
				createTestMessage("user", "Second"),
			},
		},
		{
			name:          "empty input messages",
			inputMessages: []Message{},
			memoryMessages: []Message{
				createTestMessage("system", "System only"),
				createTestMessage("user", "Memory only"),
			},
			want: []Message{
				createTestMessage("system", "System only"),
				createTestMessage("user", "Memory only"),
			},
		},
		{
			name:           "both empty",
			inputMessages:  []Message{},
			memoryMessages: []Message{},
			want:           []Message{},
		},
		{
			name: "single message each",
			inputMessages: []Message{
				createTestMessage("user", "Input"),
			},
			memoryMessages: []Message{
				createTestMessage("system", "Memory"),
			},
			want: []Message{
				createTestMessage("system", "Memory"),
				createTestMessage("user", "Input"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PrepareModelMessages(tt.inputMessages, tt.memoryMessages)

			if !reflect.DeepEqual(messagesSignature(got), messagesSignature(tt.want)) {
				t.Errorf("PrepareModelMessages() = %v, want %v", got, tt.want)
			}

			// Verify that the slice has the expected capacity
			expectedCap := len(tt.memoryMessages) + len(tt.inputMessages)
			if cap(got) < expectedCap {
				t.Errorf("PrepareModelMessages() capacity = %d, want at least %d", cap(got), expectedCap)
			}
		})
	}
}

func TestPrepareNewMessagesForMemory(t *testing.T) {
	tests := []struct {
		name             string
		inputMessages    []Message
		responseMessages []Message
		want             []Message
	}{
		{
			name: "input and response messages",
			inputMessages: []Message{
				createTestMessage("user", "Question 1"),
				createTestMessage("user", "Question 2"),
			},
			responseMessages: []Message{
				createTestMessage("assistant", "Answer 1"),
				createTestMessage("assistant", "Answer 2"),
			},
			want: []Message{
				createTestMessage("user", "Question 1"),
				createTestMessage("user", "Question 2"),
				createTestMessage("assistant", "Answer 1"),
				createTestMessage("assistant", "Answer 2"),
			},
		},
		{
			name: "single message each",
			inputMessages: []Message{
				createTestMessage("user", testContentSingleQuestion),
			},
			responseMessages: []Message{
				createTestMessage("assistant", testContentSingleAnswer),
			},
			want: []Message{
				createTestMessage("user", testContentSingleQuestion),
				createTestMessage("assistant", testContentSingleAnswer),
			},
		},
		{
			name:          "empty input messages",
			inputMessages: []Message{},
			responseMessages: []Message{
				createTestMessage("assistant", "Response only"),
			},
			want: []Message{
				createTestMessage("assistant", "Response only"),
			},
		},
		{
			name: "empty response messages",
			inputMessages: []Message{
				createTestMessage("user", "Input only"),
			},
			responseMessages: []Message{},
			want: []Message{
				createTestMessage("user", "Input only"),
			},
		},
		{
			name:             "both empty",
			inputMessages:    []Message{},
			responseMessages: []Message{},
			want:             []Message{},
		},
		{
			name: "multiple input, single response",
			inputMessages: []Message{
				createTestMessage("user", "Multi-part"),
				createTestMessage("user", "question"),
				createTestMessage("user", "here"),
			},
			responseMessages: []Message{
				createTestMessage("assistant", "Single response"),
			},
			want: []Message{
				createTestMessage("user", "Multi-part"),
				createTestMessage("user", "question"),
				createTestMessage("user", "here"),
				createTestMessage("assistant", "Single response"),
			},
		},
		{
			name: "single input, multiple responses",
			inputMessages: []Message{
				createTestMessage("user", testContentSingleQuestion),
			},
			responseMessages: []Message{
				createTestMessage("assistant", "First part"),
				createTestMessage("assistant", "Second part"),
			},
			want: []Message{
				createTestMessage("user", testContentSingleQuestion),
				createTestMessage("assistant", "First part"),
				createTestMessage("assistant", "Second part"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PrepareNewMessagesForMemory(tt.inputMessages, tt.responseMessages)

			if !reflect.DeepEqual(messagesSignature(got), messagesSignature(tt.want)) {
				t.Errorf("PrepareNewMessagesForMemory() = %v, want %v", got, tt.want)
			}

			// Verify that the slice has the expected capacity
			expectedCap := len(tt.inputMessages) + len(tt.responseMessages)
			if cap(got) < expectedCap {
				t.Errorf("PrepareNewMessagesForMemory() capacity = %d, want at least %d", cap(got), expectedCap)
			}
		})
	}
}

// Benchmark tests to ensure efficient memory allocation
func BenchmarkPrepareExecutionMessages(b *testing.B) {
	inputMessages := make([]Message, 5)
	memoryMessages := make([]Message, 10)

	for i := range inputMessages {
		inputMessages[i] = createTestMessage("user", "input")
	}
	for i := range memoryMessages {
		memoryMessages[i] = createTestMessage("assistant", "memory")
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = PrepareExecutionMessages(inputMessages, memoryMessages)
	}
}

func BenchmarkPrepareModelMessages(b *testing.B) {
	inputMessages := make([]Message, 5)
	memoryMessages := make([]Message, 10)

	for i := range inputMessages {
		inputMessages[i] = createTestMessage("user", "input")
	}
	for i := range memoryMessages {
		memoryMessages[i] = createTestMessage("assistant", "memory")
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = PrepareModelMessages(inputMessages, memoryMessages)
	}
}

func BenchmarkPrepareNewMessagesForMemory(b *testing.B) {
	inputMessages := make([]Message, 3)
	responseMessages := make([]Message, 2)

	for i := range inputMessages {
		inputMessages[i] = createTestMessage("user", "input")
	}
	for i := range responseMessages {
		responseMessages[i] = createTestMessage("assistant", "response")
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = PrepareNewMessagesForMemory(inputMessages, responseMessages)
	}
}

func TestExtractLastAssistantMessageContent(t *testing.T) {
	tests := []struct {
		name     string
		messages []Message
		want     string
	}{
		{
			name: "assistant message at the end",
			messages: []Message{
				createTestMessage("user", "Question"),
				createTestMessage("assistant", "Answer"),
			},
			want: "Answer",
		},
		{
			name: "assistant message in the middle, user at end",
			messages: []Message{
				createTestMessage("user", "Question 1"),
				createTestMessage("assistant", "Answer 1"),
				createTestMessage("user", "Question 2"),
			},
			want: "Answer 1",
		},
		{
			name: "multiple assistant messages, returns last one",
			messages: []Message{
				createTestMessage("user", "Question 1"),
				createTestMessage("assistant", "Answer 1"),
				createTestMessage("user", "Question 2"),
				createTestMessage("assistant", "Answer 2"),
			},
			want: "Answer 2",
		},
		{
			name: "no assistant messages",
			messages: []Message{
				createTestMessage("user", "Question 1"),
				createTestMessage("user", "Question 2"),
				createTestMessage("system", "System prompt"),
			},
			want: "",
		},
		{
			name:     "empty messages",
			messages: []Message{},
			want:     "",
		},
		{
			name: "assistant message with empty content",
			messages: []Message{
				createTestMessage("user", "Question"),
				createTestMessage("assistant", ""),
			},
			want: "",
		},
		{
			name: "assistant message with empty content, then valid assistant message",
			messages: []Message{
				createTestMessage("user", "Question 1"),
				createTestMessage("assistant", ""),
				createTestMessage("user", "Question 2"),
				createTestMessage("assistant", "Valid answer"),
			},
			want: "Valid answer",
		},
		{
			name: "assistant message at the beginning",
			messages: []Message{
				createTestMessage("assistant", "First answer"),
				createTestMessage("user", "Question"),
				createTestMessage("system", "System"),
			},
			want: "First answer",
		},
		{
			name: "mixed message types with assistant at end",
			messages: []Message{
				createTestMessage("system", "System prompt"),
				createTestMessage("user", "Question 1"),
				createTestMessage("assistant", "Answer 1"),
				createTestMessage("user", "Question 2"),
				createTestMessage("assistant", "Final answer"),
			},
			want: "Final answer",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExtractLastAssistantMessageContent(tt.messages)
			if got != tt.want {
				t.Errorf("ExtractLastAssistantMessageContent() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPrepareA2AExecutionMessages(t *testing.T) {
	input := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("first")}),
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("current")}),
	}
	memory := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("history")}),
	}

	current, contextMessages := PrepareA2AExecutionMessages(input, memory)
	if got := ExtractA2ATextFromMessage(current); got != "current" {
		t.Fatalf("current message = %q, want %q", got, "current")
	}
	if len(contextMessages) != 2 {
		t.Fatalf("context message len = %d, want %d", len(contextMessages), 2)
	}
	if got := ExtractA2ATextFromMessage(contextMessages[0]); got != "history" {
		t.Fatalf("context[0] = %q, want %q", got, "history")
	}
	if got := ExtractA2ATextFromMessage(contextMessages[1]); got != "first" {
		t.Fatalf("context[1] = %q, want %q", got, "first")
	}
}

func TestPrepareA2ANewMessagesForMemory(t *testing.T) {
	input := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("q")}),
	}
	response := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("a")}),
	}

	newMessages := PrepareA2ANewMessagesForMemory(input, response)
	if len(newMessages) != 2 {
		t.Fatalf("new messages len = %d, want %d", len(newMessages), 2)
	}
	if got := ExtractA2ATextFromMessage(newMessages[0]); got != "q" {
		t.Fatalf("newMessages[0] = %q, want %q", got, "q")
	}
	if got := ExtractA2ATextFromMessage(newMessages[1]); got != "a" {
		t.Fatalf("newMessages[1] = %q, want %q", got, "a")
	}
}

func TestExtractA2AUserMessageContent(t *testing.T) {
	messages := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("assistant")}),
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("user-input")}),
	}

	if got := ExtractA2AUserMessageContent(messages); got != "user-input" {
		t.Fatalf("ExtractA2AUserMessageContent() = %q, want %q", got, "user-input")
	}
}
