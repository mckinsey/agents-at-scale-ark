package genai

import (
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func A2AToOpenAIMessage(msg protocol.Message) (openai.ChatCompletionMessageParamUnion, error) {
	role := resolveA2AMessageRole(msg)
	content := extractTextFromParts(msg.Parts)
	switch role {
	case RoleUser:
		return openai.UserMessage(content), nil
	case RoleSystem:
		return openai.SystemMessage(content), nil
	case RoleTool:
		return convertA2AToolMessage(msg.Metadata, content), nil
	case RoleAssistant:
		return convertA2AAssistantMessage(msg.Metadata, content), nil
	default:
		return openai.UserMessage(content), nil
	}
}

func resolveA2AMessageRole(msg protocol.Message) string {
	switch msg.Role {
	case protocol.MessageRoleUser:
		return RoleUser
	case protocol.MessageRoleAgent:
		if msg.Metadata != nil {
			if value, ok := msg.Metadata[MetadataRoleKey].(string); ok && value != "" {
				return value
			}
		}
		return RoleAssistant
	default:
		return RoleAssistant
	}
}

func convertA2AToolMessage(metadata map[string]interface{}, content string) openai.ChatCompletionMessageParamUnion {
	toolCallID := ""
	if metadata != nil {
		if value, ok := metadata[MetadataToolCallIDKey].(string); ok {
			toolCallID = value
		}
	}
	if toolCallID == "" {
		return openai.AssistantMessage(content)
	}
	return openai.ToolMessage(content, toolCallID)
}

func convertA2AAssistantMessage(metadata map[string]interface{}, content string) openai.ChatCompletionMessageParamUnion {
	assistant := openai.AssistantMessage(content)
	if assistant.OfAssistant != nil && metadata != nil {
		if value, ok := metadata[MetadataToolCallsKey]; ok {
			toolCalls := recoverToolCalls(value)
			if len(toolCalls) > 0 {
				assistant.OfAssistant.ToolCalls = toolCalls
			}
		}
	}
	return assistant
}

func recoverToolCalls(value interface{}) []openai.ChatCompletionMessageToolCallParam {
	switch calls := value.(type) {
	case []openai.ChatCompletionMessageToolCallParam:
		return rebuildToolCallParams(calls)
	case []openai.ChatCompletionMessageToolCall:
		params := make([]openai.ChatCompletionMessageToolCallParam, len(calls))
		for i, call := range calls {
			params[i] = openai.ChatCompletionMessageToolCallParam{
				ID: call.ID,
				Function: openai.ChatCompletionMessageToolCallFunctionParam{
					Name:      call.Function.Name,
					Arguments: call.Function.Arguments,
				},
			}
		}
		return params
	default:
		raw, err := json.Marshal(value)
		if err != nil {
			return nil
		}
		var params []openai.ChatCompletionMessageToolCallParam
		if err := json.Unmarshal(raw, &params); err == nil && len(params) > 0 {
			return rebuildToolCallParams(params)
		}
		return nil
	}
}

func rebuildToolCallParams(params []openai.ChatCompletionMessageToolCallParam) []openai.ChatCompletionMessageToolCallParam {
	result := make([]openai.ChatCompletionMessageToolCallParam, len(params))
	for i, p := range params {
		args := p.Function.Arguments
		if args == "" {
			args = "{}"
		}
		result[i] = openai.ChatCompletionMessageToolCallParam{
			ID: p.ID,
			Function: openai.ChatCompletionMessageToolCallFunctionParam{
				Name:      p.Function.Name,
				Arguments: args,
			},
		}
	}
	return result
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

func OpenAIToA2AMessage(msg openai.ChatCompletionMessageParamUnion) (protocol.Message, error) {
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
		return protocol.Message{}, fmt.Errorf("unsupported OpenAI message type")
	}
}
