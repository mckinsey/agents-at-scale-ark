/* Copyright 2025. McKinsey & Company */

package genai

import (
	"strings"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

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
			if content := extractUserContent(msgUnion.OfUser); content != "" {
				return content
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

func PrepareA2AExecutionMessages(inputMessages, memoryMessages []protocol.Message) (currentMessage protocol.Message, contextMessages []protocol.Message) {
	currentMessage = inputMessages[len(inputMessages)-1]
	contextMessages = make([]protocol.Message, 0, len(memoryMessages)+len(inputMessages)-1)
	contextMessages = append(contextMessages, memoryMessages...)
	contextMessages = append(contextMessages, inputMessages[:len(inputMessages)-1]...)
	return currentMessage, contextMessages
}

func PrepareA2ANewMessagesForMemory(inputMessages, responseMessages []protocol.Message) []protocol.Message {
	newMessages := make([]protocol.Message, 0, len(inputMessages)+len(responseMessages))
	newMessages = append(newMessages, inputMessages...)
	newMessages = append(newMessages, responseMessages...)
	return newMessages
}

func ExtractA2ATextFromMessage(message protocol.Message) string {
	return extractTextFromParts(message.Parts)
}

func ExtractA2AUserMessageContent(messages []protocol.Message) string {
	for _, msg := range messages {
		if msg.Role == protocol.MessageRoleUser {
			return extractTextFromParts(msg.Parts)
		}
	}
	return ""
}

// ExtractLastAssistantMessageContent extracts the content from the last assistant message
// in the messages array, searching backwards from the end. Returns empty string if no
// assistant message with content is found. This is used by tool executors to extract
// the final response from agent/team execution results.
func ExtractLastAssistantMessageContent(messages []Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msgUnion := openai.ChatCompletionMessageParamUnion(messages[i])
		if msgUnion.OfAssistant == nil {
			continue
		}
		if text := extractTextFromMessageParam(msgUnion); text != "" {
			return text
		}
	}
	return ""
}

func ExtractTextFromMessage(message Message) string {
	return extractTextFromMessageParam(openai.ChatCompletionMessageParamUnion(message))
}

func resolveMessageRole(msg Message) string {
	msgUnion := openai.ChatCompletionMessageParamUnion(msg)
	switch {
	case msgUnion.OfUser != nil:
		return RoleUser
	case msgUnion.OfSystem != nil:
		return RoleSystem
	case msgUnion.OfTool != nil:
		return RoleTool
	case msgUnion.OfAssistant != nil:
		return RoleAssistant
	default:
		return RoleAssistant
	}
}

func extractTextFromMessageParam(msg openai.ChatCompletionMessageParamUnion) string {
	switch {
	case msg.OfUser != nil:
		return extractUserContent(msg.OfUser)
	case msg.OfAssistant != nil:
		return msg.OfAssistant.Content.OfString.Value
	case msg.OfSystem != nil:
		return msg.OfSystem.Content.OfString.Value
	case msg.OfTool != nil:
		return msg.OfTool.Content.OfString.Value
	default:
		return ""
	}
}

func extractTextFromContentParts(parts []openai.ChatCompletionContentPartTextParam) string {
	if len(parts) == 0 {
		return ""
	}
	var builder strings.Builder
	for _, part := range parts {
		if part.Text != "" {
			builder.WriteString(part.Text)
		}
	}
	return builder.String()
}
