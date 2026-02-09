package genai

import (
	"fmt"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func A2AToOpenAIMessage(msg Message) (openai.ChatCompletionMessageParamUnion, error) {
	role := resolveMessageRole(msg)
	content := extractTextFromParts(msg.Parts)
	switch role {
	case RoleUser:
		return openai.UserMessage(content), nil
	case RoleSystem:
		return openai.SystemMessage(content), nil
	case RoleTool:
		toolCallID := ""
		if msg.Metadata != nil {
			if value, ok := msg.Metadata[MetadataToolCallIDKey].(string); ok {
				toolCallID = value
			}
		}
		if toolCallID == "" {
			return openai.AssistantMessage(content), nil
		}
		return openai.ToolMessage(content, toolCallID), nil
	case RoleAssistant:
		assistant := openai.AssistantMessage(content)
		if assistant.OfAssistant != nil && msg.Metadata != nil {
			if value, ok := msg.Metadata[MetadataToolCallsKey]; ok {
				switch calls := value.(type) {
				case []openai.ChatCompletionMessageToolCallParam:
					assistant.OfAssistant.ToolCalls = calls
				case []openai.ChatCompletionMessageToolCall:
					params := make([]openai.ChatCompletionMessageToolCallParam, len(calls))
					for i, call := range calls {
						params[i] = call.ToParam()
					}
					assistant.OfAssistant.ToolCalls = params
				}
			}
		}
		return assistant, nil
	default:
		return openai.UserMessage(content), nil
	}
}

func OpenAIToA2AMessage(msg openai.ChatCompletionMessageParamUnion) (Message, error) {
	switch {
	case msg.OfUser != nil:
		content := msg.OfUser.Content.OfString.Value
		return protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(content),
		}), nil
	case msg.OfAssistant != nil:
		content := msg.OfAssistant.Content.OfString.Value
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(content),
		})
		if toolCalls := msg.GetToolCalls(); len(toolCalls) > 0 {
			message.Metadata = map[string]interface{}{
				MetadataToolCallsKey: toolCalls,
			}
		}
		return message, nil
	case msg.OfSystem != nil:
		content := msg.OfSystem.Content.OfString.Value
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(content),
		})
		message.Metadata = map[string]interface{}{
			MetadataRoleKey: RoleSystem,
		}
		return message, nil
	case msg.OfTool != nil:
		content := msg.OfTool.Content.OfString.Value
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(content),
		})
		message.Metadata = map[string]interface{}{
			MetadataRoleKey:       RoleTool,
			MetadataToolCallIDKey: msg.OfTool.ToolCallID,
		}
		return message, nil
	default:
		return Message{}, fmt.Errorf("unsupported OpenAI message type")
	}
}
