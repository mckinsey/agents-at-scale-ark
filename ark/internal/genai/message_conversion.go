package genai

import (
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/openai/openai-go"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

const emptyTextContentFallback = "."

func ensureNonEmptyTextContent(content string) string {
	if content == "" {
		return emptyTextContentFallback
	}
	return content
}

func ensureNonEmptyToolContent(content string) string {
	if content == "" {
		return "{}"
	}
	return content
}

func A2AToOpenAIMessage(msg protocol.Message) (openai.ChatCompletionMessageParamUnion, error) {
	role := resolveA2AMessageRole(msg)
	content := extractTextFromParts(msg.Parts)
	switch role {
	case RoleUser:
		return openai.UserMessage(ensureNonEmptyTextContent(content)), nil
	case RoleSystem:
		return openai.SystemMessage(ensureNonEmptyTextContent(content)), nil
	case RoleTool:
		return convertA2AToolMessage(msg.Parts, msg.Metadata, content), nil
	case RoleAssistant:
		return convertA2AAssistantMessage(msg.Parts, content), nil
	default:
		return openai.UserMessage(ensureNonEmptyTextContent(content)), nil
	}
}

func resolveA2AMessageRole(msg protocol.Message) string {
	switch msg.Role {
	case protocol.MessageRoleUser:
		return RoleUser
	case protocol.MessageRoleAgent:
		if role, ok := extractRoleHintFromParts(msg.Parts); ok {
			return role
		}
		if _, ok := extractToolResultPayloadFromParts(msg.Parts); ok {
			return RoleTool
		}
		if msg.Metadata != nil {
			if role, ok := msg.Metadata[MetadataRoleKey].(string); ok && role != "" {
				return role
			}
		}
		return RoleAssistant
	default:
		return RoleAssistant
	}
}

func convertA2AToolMessage(parts []protocol.Part, metadata map[string]interface{}, fallbackContent string) openai.ChatCompletionMessageParamUnion {
	payload, _ := extractToolResultPayloadFromParts(parts)
	content := payload.Content
	if content == "" {
		content = fallbackContent
	}
	toolCallID := payload.ToolCallID
	if toolCallID == "" && metadata != nil {
		if legacyID, ok := metadata[MetadataToolCallIDKey].(string); ok && legacyID != "" {
			toolCallID = legacyID
		}
	}
	if toolCallID == "" {
		slog.Warn("tool message missing ToolCallID, converting to assistant message")
		return openai.AssistantMessage(ensureNonEmptyTextContent(content))
	}
	return openai.ToolMessage(ensureNonEmptyToolContent(content), toolCallID)
}

func convertA2AAssistantMessage(parts []protocol.Part, content string) openai.ChatCompletionMessageParamUnion {
	assistant := openai.AssistantMessage(ensureNonEmptyTextContent(content))
	if assistant.OfAssistant != nil {
		toolCalls := extractToolCallsFromParts(parts)
		if len(toolCalls) > 0 {
			assistant.OfAssistant.ToolCalls = toolCalls
		}
	}
	return assistant
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
		parts := []protocol.Part{
			protocol.NewTextPart(content),
		}
		if toolCalls := msg.GetToolCalls(); len(toolCalls) > 0 {
			payloadCalls := make([]ToolCallPayloadV1, 0, len(toolCalls))
			for _, tc := range toolCalls {
				args := tc.Function.Arguments
				if args == "" {
					args = "{}"
				}
				payloadCalls = append(payloadCalls, ToolCallPayloadV1{
					ID:        tc.ID,
					Name:      tc.Function.Name,
					Arguments: args,
				})
			}
			parts = appendPayloadPart(parts, ToolCallsPayloadV1{
				Schema:    A2APayloadSchemaToolCallsV1,
				ToolCalls: payloadCalls,
			})
		}
		message := protocol.NewMessage(protocol.MessageRoleAgent, parts)
		return message, nil
	case msg.OfSystem != nil:
		content := msg.OfSystem.Content.OfString.Value
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(content),
			&protocol.DataPart{
				Kind: protocol.KindData,
				Data: RoleHintPayloadV1{
					Schema: A2APayloadSchemaRoleHintV1,
					Role:   RoleSystem,
				},
			},
		})
		return message, nil
	case msg.OfTool != nil:
		content := msg.OfTool.Content.OfString.Value
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(content),
			&protocol.DataPart{
				Kind: protocol.KindData,
				Data: ToolResultPayloadV1{
					Schema:     A2APayloadSchemaToolResultV1,
					ToolCallID: msg.OfTool.ToolCallID,
					Content:    content,
				},
			},
		})
		return message, nil
	default:
		return protocol.Message{}, fmt.Errorf("unsupported OpenAI message type")
	}
}

func decodePartData(part protocol.Part) (map[string]interface{}, bool) {
	switch typed := part.(type) {
	case protocol.DataPart:
		return decodeDataObject(typed.Data)
	case *protocol.DataPart:
		return decodeDataObject(typed.Data)
	default:
		return nil, false
	}
}

func decodeDataObject(value interface{}) (map[string]interface{}, bool) {
	if value == nil {
		return nil, false
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, false
	}
	var object map[string]interface{}
	if err := json.Unmarshal(raw, &object); err != nil {
		return nil, false
	}
	if len(object) == 0 {
		return nil, false
	}
	return object, true
}

func extractRoleHintFromParts(parts []protocol.Part) (string, bool) {
	for _, part := range parts {
		data, ok := decodePartData(part)
		if !ok {
			continue
		}
		schema, _ := data["schema"].(string)
		if schema != A2APayloadSchemaRoleHintV1 {
			continue
		}
		role, ok := data["role"].(string)
		if !ok || role == "" {
			continue
		}
		return role, true
	}
	return "", false
}

func extractToolCallsFromParts(parts []protocol.Part) []openai.ChatCompletionMessageToolCallParam {
	for _, part := range parts {
		data, ok := decodePartData(part)
		if !ok {
			continue
		}
		schema, _ := data["schema"].(string)
		if schema != A2APayloadSchemaToolCallsV1 {
			continue
		}
		rawCalls, ok := data["toolCalls"]
		if !ok {
			return nil
		}
		raw, err := json.Marshal(rawCalls)
		if err != nil {
			return nil
		}
		var calls []ToolCallPayloadV1
		if err := json.Unmarshal(raw, &calls); err != nil {
			return nil
		}
		params := make([]openai.ChatCompletionMessageToolCallParam, 0, len(calls))
		for _, call := range calls {
			if call.ID == "" || call.Name == "" {
				continue
			}
			args := call.Arguments
			if args == "" {
				args = "{}"
			}
			params = append(params, openai.ChatCompletionMessageToolCallParam{
				ID: call.ID,
				Function: openai.ChatCompletionMessageToolCallFunctionParam{
					Name:      call.Name,
					Arguments: args,
				},
			})
		}
		return params
	}
	return nil
}

func extractToolResultPayloadFromParts(parts []protocol.Part) (ToolResultPayloadV1, bool) {
	for _, part := range parts {
		data, ok := decodePartData(part)
		if !ok {
			continue
		}
		schema, _ := data["schema"].(string)
		if schema != A2APayloadSchemaToolResultV1 {
			continue
		}
		raw, err := json.Marshal(data)
		if err != nil {
			return ToolResultPayloadV1{}, false
		}
		var payload ToolResultPayloadV1
		if err := json.Unmarshal(raw, &payload); err != nil {
			return ToolResultPayloadV1{}, false
		}
		return payload, true
	}
	return ToolResultPayloadV1{}, false
}
