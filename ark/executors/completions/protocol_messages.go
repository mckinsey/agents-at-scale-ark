package completions

import (
	"fmt"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arka2a "mckinsey.com/ark/internal/a2a"
)

const (
	metadataAssistantName = "assistantName"
	metadataToolCallID    = "toolCallID"
)

func ProtocolMessageFromOpenAI(msg Message) ProtocolMessage {
	switch {
	case msg.OfUser != nil:
		return protocolMessageWithText(protocol.MessageRoleUser, msg.OfUser.Content.OfString.Value, nil)
	case msg.OfAssistant != nil:
		metadata := map[string]any{}
		if msg.OfAssistant.Name.Value != "" {
			metadata[metadataAssistantName] = msg.OfAssistant.Name.Value
		}
		return protocolMessageWithText(protocol.MessageRoleAgent, msg.OfAssistant.Content.OfString.Value, metadata)
	case msg.OfSystem != nil:
		return protocolMessageWithText(protocol.MessageRoleUser, msg.OfSystem.Content.OfString.Value, map[string]any{
			"sourceRole": RoleSystem,
		})
	case msg.OfTool != nil:
		metadata := map[string]any{
			"sourceRole": RoleTool,
		}
		if msg.OfTool.ToolCallID != "" {
			metadata[metadataToolCallID] = msg.OfTool.ToolCallID
		}
		return protocolMessageWithText(protocol.MessageRoleAgent, msg.OfTool.Content.OfString.Value, metadata)
	case msg.OfFunction != nil:
		return protocolMessageWithText(protocol.MessageRoleAgent, msg.OfFunction.Content.Value, map[string]any{
			"sourceRole": "function",
		})
	default:
		return protocolMessageWithText(protocol.MessageRoleUser, "", nil)
	}
}

func ProtocolMessagesFromOpenAI(messages []Message) []ProtocolMessage {
	result := make([]ProtocolMessage, 0, len(messages))
	for _, msg := range messages {
		result = append(result, ProtocolMessageFromOpenAI(msg))
	}
	return result
}

func OpenAIMessageFromProtocol(msg ProtocolMessage) Message {
	text := arka2a.ExtractTextFromParts(msg.Parts)

	if sourceRole, ok := metadataString(msg.Metadata, "sourceRole"); ok {
		switch sourceRole {
		case RoleSystem:
			return NewSystemMessage(text)
		case RoleTool:
			toolCallID, _ := metadataString(msg.Metadata, metadataToolCallID)
			if toolCallID != "" {
				return ToolMessage(text, toolCallID)
			}
			return NewAssistantMessage(text)
		case "function":
			return NewAssistantMessage(text)
		}
	}

	switch msg.Role {
	case protocol.MessageRoleUser:
		return NewUserMessage(text)
	case protocol.MessageRoleAgent:
		assistant := NewAssistantMessage(text)
		if assistantName, ok := metadataString(msg.Metadata, metadataAssistantName); ok && assistantName != "" && assistant.OfAssistant != nil {
			assistant.OfAssistant.Name = openai.String(assistantName)
		}
		return assistant
	default:
		return NewUserMessage(text)
	}
}

func OpenAIMessagesFromProtocol(messages []ProtocolMessage) []Message {
	result := make([]Message, 0, len(messages))
	for _, msg := range messages {
		result = append(result, OpenAIMessageFromProtocol(msg))
	}
	return result
}

func ProtocolUserMessage(content string) ProtocolMessage {
	return protocolMessageWithText(protocol.MessageRoleUser, content, nil)
}

func ProtocolAssistantMessage(content, assistantName string) ProtocolMessage {
	metadata := map[string]any{}
	if assistantName != "" {
		metadata[metadataAssistantName] = assistantName
	}
	return protocolMessageWithText(protocol.MessageRoleAgent, content, metadata)
}

func ProtocolSystemMessage(content string) ProtocolMessage {
	return protocolMessageWithText(protocol.MessageRoleUser, content, map[string]any{
		"sourceRole": RoleSystem,
	})
}

func ProtocolToolMessage(content, toolCallID string) ProtocolMessage {
	metadata := map[string]any{
		"sourceRole": RoleTool,
	}
	if toolCallID != "" {
		metadata[metadataToolCallID] = toolCallID
	}
	return protocolMessageWithText(protocol.MessageRoleAgent, content, metadata)
}

func ProtocolMessageText(msg ProtocolMessage) string {
	return arka2a.ExtractTextFromParts(msg.Parts)
}

func ExtractLastProtocolAssistantMessageContent(messages []ProtocolMessage) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if msg.Role != protocol.MessageRoleAgent {
			continue
		}
		if sourceRole, ok := metadataString(msg.Metadata, "sourceRole"); ok && sourceRole != "" {
			continue
		}
		text := ProtocolMessageText(msg)
		if text != "" {
			return text
		}
	}
	return ""
}

func protocolMessageWithText(role protocol.MessageRole, text string, metadata map[string]any) ProtocolMessage {
	parts := make([]protocol.Part, 0, 1)
	if text != "" {
		parts = append(parts, protocol.NewTextPart(text))
	}
	msg := protocol.NewMessage(role, parts)
	if len(metadata) > 0 {
		msg.Metadata = metadata
	}
	return msg
}

func metadataString(metadata map[string]any, key string) (string, bool) {
	if metadata == nil {
		return "", false
	}
	value, ok := metadata[key]
	if !ok {
		return "", false
	}
	switch typed := value.(type) {
	case string:
		return typed, true
	default:
		return fmt.Sprintf("%v", typed), true
	}
}
