package provider

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/shared/constant"
	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func toolDefsToOpenAI(defs []ToolDefinition) []openai.ChatCompletionToolParam {
	if len(defs) == 0 {
		return nil
	}
	params := make([]openai.ChatCompletionToolParam, len(defs))
	for i, def := range defs {
		params[i] = openai.ChatCompletionToolParam{
			Function: openai.FunctionDefinitionParam{
				Name:        def.Name,
				Description: openai.String(def.Description),
				Parameters:  openai.FunctionParameters(def.Parameters),
			},
		}
	}
	return params
}

func buildToolOutcomeMap(outcomes []ToolOutcome) map[string]string {
	m := make(map[string]string, len(outcomes))
	for _, o := range outcomes {
		if o.ToolCallID == "" {
			continue
		}
		content := o.Content
		if content == "" {
			content = o.Error
		}
		if content == "" && len(o.Metadata) > 0 {
			raw, err := json.Marshal(o.Metadata)
			if err == nil {
				content = string(raw)
			}
		}
		if content == "" {
			content = "{}"
		}
		m[o.ToolCallID] = content
	}
	return m
}

func normalizeToolCallMessages(messages []openai.ChatCompletionMessageParamUnion, outcomeByID map[string]string) []openai.ChatCompletionMessageParamUnion {
	if len(messages) == 0 {
		return messages
	}
	out := make([]openai.ChatCompletionMessageParamUnion, 0, len(messages))
	for i := 0; i < len(messages); {
		current := messages[i]
		if current.OfAssistant == nil || len(current.OfAssistant.ToolCalls) == 0 {
			out = append(out, current)
			i++
			continue
		}

		out = append(out, current)
		j := i + 1
		explicitByID := make(map[string]openai.ChatCompletionMessageParamUnion)
		var explicitOrder []openai.ChatCompletionMessageParamUnion
		for j < len(messages) {
			m := messages[j]
			if m.OfTool == nil {
				break
			}
			explicitOrder = append(explicitOrder, m)
			explicitByID[m.OfTool.ToolCallID] = m
			j++
		}

		usedExplicit := make(map[string]bool)
		for _, tc := range current.OfAssistant.ToolCalls {
			if tc.ID == "" {
				continue
			}
			if explicit, ok := explicitByID[tc.ID]; ok {
				out = append(out, explicit)
				usedExplicit[tc.ID] = true
				continue
			}
			if content, ok := outcomeByID[tc.ID]; ok {
				out = append(out, openai.ToolMessage(content, tc.ID))
			}
		}
		for _, explicit := range explicitOrder {
			if explicit.OfTool != nil && !usedExplicit[explicit.OfTool.ToolCallID] {
				out = append(out, explicit)
			}
		}
		i = j
	}
	return out
}

func convertA2AMessagesToOpenAI(messages []a2aprotocol.Message) ([]openai.ChatCompletionMessageParamUnion, error) {
	result := make([]openai.ChatCompletionMessageParamUnion, 0, len(messages))
	for i, msg := range messages {
		converted, err := a2aToOpenAIMessage(msg)
		if err != nil {
			return nil, fmt.Errorf("message %d: %w", i, err)
		}
		result = append(result, converted)
	}
	return result, nil
}

func a2aToOpenAIMessage(msg a2aprotocol.Message) (openai.ChatCompletionMessageParamUnion, error) {
	role := resolveRole(msg)
	text := extractText(msg)

	switch role {
	case "system":
		return openai.SystemMessage(text), nil
	case "user":
		return openai.UserMessage(text), nil
	case "assistant":
		assistantMsg := openai.AssistantMessage(text)
		toolCalls := extractToolCalls(msg)
		if len(toolCalls) > 0 {
			params := make([]openai.ChatCompletionMessageToolCallParam, len(toolCalls))
			for i, tc := range toolCalls {
				args := tc.Arguments
				if args == "" {
					args = "{}"
				}
				params[i] = openai.ChatCompletionMessageToolCallParam{
					ID: tc.ID,
					Function: openai.ChatCompletionMessageToolCallFunctionParam{
						Name:      tc.Name,
						Arguments: args,
					},
				}
			}
			assistantMsg.OfAssistant.ToolCalls = params
		}
		return assistantMsg, nil
	case "tool":
		toolCallID := extractToolCallID(msg)
		return openai.ToolMessage(text, toolCallID), nil
	default:
		return openai.UserMessage(text), nil
	}
}

func resolveRole(msg a2aprotocol.Message) string {
	if msg.Metadata != nil {
		if roleVal, ok := msg.Metadata["ark.mckinsey.com/role"]; ok {
			if role, ok := roleVal.(string); ok {
				return role
			}
		}
	}
	for _, part := range msg.Parts {
		if dp, ok := part.(*a2aprotocol.DataPart); ok {
			if dp.Data != nil {
				if dataMap, ok := dp.Data.(map[string]interface{}); ok {
					if schema, ok := dataMap["schema"].(string); ok && schema == "https://ark.mckinsey.com/payloads/role-hint/v1" {
						if role, ok := dataMap["role"].(string); ok {
							return role
						}
					}
				}
			}
		}
	}
	switch msg.Role {
	case a2aprotocol.MessageRoleAgent:
		return "assistant"
	case a2aprotocol.MessageRoleUser:
		return "user"
	default:
		return string(msg.Role)
	}
}

func extractText(msg a2aprotocol.Message) string {
	var text string
	for _, part := range msg.Parts {
		switch p := part.(type) {
		case *a2aprotocol.TextPart:
			if text != "" {
				text += "\n"
			}
			text += p.Text
		}
	}
	return text
}

func extractToolCalls(msg a2aprotocol.Message) []ToolCall {
	var calls []ToolCall
	for _, part := range msg.Parts {
		if dp, ok := part.(*a2aprotocol.DataPart); ok && dp.Data != nil {
			if dataMap, ok := dp.Data.(map[string]interface{}); ok {
				if schema, ok := dataMap["schema"].(string); ok && schema == "https://ark.mckinsey.com/payloads/tool-calls/v1" {
					if toolCallsRaw, ok := dataMap["toolCalls"].([]interface{}); ok {
						for _, tcRaw := range toolCallsRaw {
							if tc, ok := tcRaw.(map[string]interface{}); ok {
								call := ToolCall{
									ID:        stringFromMap(tc, "id"),
									Name:      stringFromMap(tc, "name"),
									Arguments: stringFromMap(tc, "arguments"),
								}
								calls = append(calls, call)
							}
						}
					}
				}
			}
		}
	}
	if len(calls) == 0 && msg.Metadata != nil {
		if tcRaw, ok := msg.Metadata["ark.mckinsey.com/tool-calls"]; ok {
			if tcJSON, ok := tcRaw.(string); ok {
				var toolCalls []ToolCall
				if err := json.Unmarshal([]byte(tcJSON), &toolCalls); err == nil {
					return toolCalls
				}
			}
		}
	}
	return calls
}

func extractToolCallID(msg a2aprotocol.Message) string {
	if msg.Metadata != nil {
		if id, ok := msg.Metadata["ark.mckinsey.com/tool-call-id"]; ok {
			if s, ok := id.(string); ok {
				return s
			}
		}
	}
	return ""
}

func stringFromMap(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func buildTurnResultFromChoice(choice openai.ChatCompletionChoice) (*TurnResult, error) {
	content := choice.Message.Content
	assistantMsg := openai.AssistantMessage(content)
	if assistantMsg.OfAssistant != nil {
		if len(choice.Message.ToolCalls) > 0 {
			toolCallParams := make([]openai.ChatCompletionMessageToolCallParam, len(choice.Message.ToolCalls))
			for i, call := range choice.Message.ToolCalls {
				args := call.Function.Arguments
				if args == "" {
					args = "{}"
				}
				toolCallParams[i] = openai.ChatCompletionMessageToolCallParam{
					ID: call.ID,
					Function: openai.ChatCompletionMessageToolCallFunctionParam{
						Name:      call.Function.Name,
						Arguments: args,
					},
				}
			}
			assistantMsg.OfAssistant.ToolCalls = toolCallParams
		}
	}

	a2aMsg, err := openAIToA2AMessage(assistantMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to convert to A2A message: %w", err)
	}

	var toolCalls []ToolCall
	for _, tc := range choice.Message.ToolCalls {
		toolCalls = append(toolCalls, ToolCall{
			ID:        tc.ID,
			Name:      tc.Function.Name,
			Arguments: tc.Function.Arguments,
		})
	}

	return &TurnResult{
		Message:   a2aMsg,
		ToolCalls: toolCalls,
		Content:   content,
	}, nil
}

func openAIToA2AMessage(msg openai.ChatCompletionMessageParamUnion) (a2aprotocol.Message, error) {
	var role a2aprotocol.MessageRole
	var parts []a2aprotocol.Part
	metadata := make(map[string]any)

	switch {
	case msg.OfSystem != nil:
		role = a2aprotocol.MessageRoleUser
		metadata["ark.mckinsey.com/role"] = "system"
		parts = append(parts, a2aprotocol.NewTextPart(msg.OfSystem.Content.OfString.Value))
	case msg.OfUser != nil:
		role = a2aprotocol.MessageRoleUser
		parts = append(parts, a2aprotocol.NewTextPart(msg.OfUser.Content.OfString.Value))
	case msg.OfAssistant != nil:
		role = a2aprotocol.MessageRoleAgent
		content := msg.OfAssistant.Content.OfString.Value
		if content != "" {
			parts = append(parts, a2aprotocol.NewTextPart(content))
		}
		if len(msg.OfAssistant.ToolCalls) > 0 {
			toolCallsPayload := map[string]any{
				"schema": "https://ark.mckinsey.com/payloads/tool-calls/v1",
			}
			calls := make([]map[string]any, len(msg.OfAssistant.ToolCalls))
			for i, tc := range msg.OfAssistant.ToolCalls {
				calls[i] = map[string]any{
					"id":        tc.ID,
					"name":      tc.Function.Name,
					"arguments": tc.Function.Arguments,
				}
			}
			toolCallsPayload["toolCalls"] = calls
			tcJSON, _ := json.Marshal(calls)
			metadata["ark.mckinsey.com/tool-calls"] = string(tcJSON)
			parts = append(parts, &a2aprotocol.DataPart{
				Kind: a2aprotocol.KindData,
				Data: toolCallsPayload,
			})
		}
	case msg.OfTool != nil:
		role = a2aprotocol.MessageRoleUser
		metadata["ark.mckinsey.com/role"] = "tool"
		metadata["ark.mckinsey.com/tool-call-id"] = msg.OfTool.ToolCallID
		parts = append(parts, a2aprotocol.NewTextPart(msg.OfTool.Content.OfString.Value))
	default:
		return a2aprotocol.Message{}, fmt.Errorf("unsupported message type")
	}

	a2aMsg := a2aprotocol.NewMessage(role, parts)
	a2aMsg.Metadata = metadata
	return a2aMsg, nil
}

func accumulateChunk(chunk *openai.ChatCompletionChunk, fullResponse **openai.ChatCompletion, toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall) {
	if *fullResponse == nil {
		*fullResponse = &openai.ChatCompletion{
			ID:      chunk.ID,
			Object:  "chat.completion",
			Created: chunk.Created,
			Model:   chunk.Model,
			Choices: []openai.ChatCompletionChoice{},
		}
	}
	if len(chunk.Choices) == 0 {
		return
	}
	choice := &chunk.Choices[0]
	if len((*fullResponse).Choices) == 0 {
		(*fullResponse).Choices = append((*fullResponse).Choices, openai.ChatCompletionChoice{
			Index:   choice.Index,
			Message: openai.ChatCompletionMessage{},
		})
	}
	if choice.Delta.Role != "" {
		(*fullResponse).Choices[0].Message.Role = constant.Assistant(choice.Delta.Role)
	}
	if choice.Delta.Content != "" {
		(*fullResponse).Choices[0].Message.Content += choice.Delta.Content
	}
	for _, deltaToolCall := range choice.Delta.ToolCalls {
		if existing, exists := toolCallsMap[deltaToolCall.Index]; exists {
			if deltaToolCall.Function.Arguments != "" {
				existing.Function.Arguments += deltaToolCall.Function.Arguments
			}
		} else {
			toolCallsMap[deltaToolCall.Index] = &openai.ChatCompletionMessageToolCall{
				ID:   deltaToolCall.ID,
				Type: constant.Function("function"),
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      deltaToolCall.Function.Name,
					Arguments: deltaToolCall.Function.Arguments,
				},
			}
		}
	}
	if choice.FinishReason != "" {
		(*fullResponse).Choices[0].FinishReason = choice.FinishReason
	}
}

func finalizeToolCalls(toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall, fullResponse *openai.ChatCompletion) {
	if len(toolCallsMap) == 0 || fullResponse == nil || len(fullResponse.Choices) == 0 {
		return
	}
	maxIndex := int64(-1)
	for idx := range toolCallsMap {
		if idx > maxIndex {
			maxIndex = idx
		}
	}
	toolCalls := make([]openai.ChatCompletionMessageToolCall, 0, len(toolCallsMap))
	for i := int64(0); i <= maxIndex; i++ {
		if tc, exists := toolCallsMap[i]; exists {
			toolCalls = append(toolCalls, *tc)
		}
	}
	fullResponse.Choices[0].Message.ToolCalls = toolCalls
}

func applyProperties(properties map[string]string, params *openai.ChatCompletionNewParams) {
	if properties == nil {
		return
	}
	if v, ok := properties["temperature"]; ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			params.Temperature = openai.Float(f)
		}
	}
	if v, ok := properties["max_tokens"]; ok {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			params.MaxTokens = openai.Int(n)
		}
	}
	if v, ok := properties["top_p"]; ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			params.TopP = openai.Float(f)
		}
	}
}
