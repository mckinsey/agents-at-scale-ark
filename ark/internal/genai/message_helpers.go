/* Copyright 2025. McKinsey & Company */

package genai

import "github.com/openai/openai-go"

// PrepareExecutionMessages separates the current message from context messages
// and combines with memory history for agent/team execution.
// This pattern is used when the last message in inputMessages should be treated
// as the current input, while all previous messages (from memory and input)
// serve as conversation context.
func PrepareExecutionMessages(inputMessages, memoryMessages []Message) (currentMessage Message, contextMessages []Message) {
	currentMessage = inputMessages[len(inputMessages)-1]
	contextMessages = make([]Message, 0, len(memoryMessages)+len(inputMessages)-1)
	contextMessages = append(contextMessages, memoryMessages...)
	contextMessages = append(contextMessages, inputMessages[:len(inputMessages)-1]...)
	return currentMessage, contextMessages
}

// ExtractUserMessageContent extracts the first user message content from messages.
// Returns empty string if no user message is found. This is used for telemetry
// to capture the initial query input.
func ExtractUserMessageContent(messages []Message) string {
	for _, msg := range messages {
		msgUnion := openai.ChatCompletionMessageParamUnion(msg)
		if msgUnion.OfUser != nil {
			if content := msgUnion.OfUser.Content; content.OfString.Value != "" {
				return content.OfString.Value
			}
		}
	}
	return ""
}

// PrepareModelMessages combines all messages for direct model execution.
// This pattern is used when all messages (memory + input) should be sent
// to the model as a continuous conversation history.
func PrepareModelMessages(inputMessages, memoryMessages []Message) []Message {
	allMessages := make([]Message, 0, len(memoryMessages)+len(inputMessages))
	allMessages = append(allMessages, memoryMessages...)
	allMessages = append(allMessages, inputMessages...)
	return allMessages
}

// PrepareNewMessagesForMemory combines input and response messages for memory storage.
// This pattern is used to save both the input messages and the generated response
// messages to memory after successful execution.
func PrepareNewMessagesForMemory(inputMessages, responseMessages []Message) []Message {
	newMessages := make([]Message, 0, len(inputMessages)+len(responseMessages))
	newMessages = append(newMessages, inputMessages...)
	newMessages = append(newMessages, responseMessages...)
	return newMessages
}

// ExtractLastAssistantMessageContent extracts the content from the last assistant message
// in the messages array, searching backwards from the end. Returns empty string if no
// assistant message with content is found. This is used by tool executors to extract
// the final response from agent/team execution results.
func ExtractLastAssistantMessageContent(messages []Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		msgUnion := openai.ChatCompletionMessageParamUnion(msg)
		if msgUnion.OfAssistant != nil && msgUnion.OfAssistant.Content.OfString.Value != "" {
			return msgUnion.OfAssistant.Content.OfString.Value
		}
	}
	return ""
}
