package genai

import (
	"encoding/json"
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
				toolCalls := recoverToolCalls(value)
				if len(toolCalls) > 0 {
					assistant.OfAssistant.ToolCalls = toolCalls
				}
			}
		}
		return assistant, nil
	default:
		return openai.UserMessage(content), nil
	}
}

func recoverToolCalls(value interface{}) []openai.ChatCompletionMessageToolCallParam {
	switch calls := value.(type) {
	case []openai.ChatCompletionMessageToolCallParam:
		return calls
	case []openai.ChatCompletionMessageToolCall:
		params := make([]openai.ChatCompletionMessageToolCallParam, len(calls))
		for i, call := range calls {
			params[i] = call.ToParam()
		}
		return params
	default:
		raw, err := json.Marshal(value)
		if err != nil {
			return nil
		}
		var params []openai.ChatCompletionMessageToolCallParam
		if err := json.Unmarshal(raw, &params); err == nil && len(params) > 0 {
			return params
		}
		return nil
	}
}

func extractUserContent(msg *openai.ChatCompletionUserMessageParam) string {
	if msg.Content.OfString.Value != "" {
		return msg.Content.OfString.Value
	}
	if len(msg.Content.OfArrayOfContentParts) > 0 {
		var text string
		for _, part := range msg.Content.OfArrayOfContentParts {
			if part.OfText != nil {
				text += part.OfText.Text
			}
		}
		return text
	}
	return ""
}

func OpenAIToA2AMessage(msg openai.ChatCompletionMessageParamUnion) (Message, error) {
	switch {
	case msg.OfUser != nil:
		content := extractUserContent(msg.OfUser)
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
