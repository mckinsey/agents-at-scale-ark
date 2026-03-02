package genai

import "github.com/openai/openai-go"

func buildToolOutcomeContentByID(outcomes []A2AToolOutcome) map[string]string {
	if len(outcomes) == 0 {
		return nil
	}
	contentByID := map[string]string{}
	for _, message := range a2aToolOutcomesToOpenAI(outcomes) {
		if message.OfTool == nil {
			continue
		}
		toolCallID := message.OfTool.ToolCallID
		if toolCallID == "" {
			continue
		}
		contentByID[toolCallID] = message.OfTool.Content.OfString.Value
	}
	if len(contentByID) == 0 {
		return nil
	}
	return contentByID
}

func normalizeAssistantToolCallMessages(messages []Message, fallbackByID map[string]string) []Message {
	if len(messages) == 0 {
		return messages
	}
	out := make([]Message, 0, len(messages))
	for i := 0; i < len(messages); {
		current := messages[i]
		if current.OfAssistant == nil || len(current.OfAssistant.ToolCalls) == 0 {
			out = append(out, current)
			i++
			continue
		}

		assistantIndex := len(out)
		out = append(out, current)

		j := i + 1
		explicitByID := map[string]Message{}
		for j < len(messages) && messages[j].OfTool != nil {
			toolMsg := messages[j]
			toolCallID := toolMsg.OfTool.ToolCallID
			if toolCallID != "" {
				explicitByID[toolCallID] = toolMsg
			}
			j++
		}

		pairedToolCalls := make([]openai.ChatCompletionMessageToolCallParam, 0, len(current.OfAssistant.ToolCalls))
		for _, toolCall := range current.OfAssistant.ToolCalls {
			toolCallID := toolCall.ID
			if toolCallID == "" {
				continue
			}
			if explicit, ok := explicitByID[toolCallID]; ok {
				out = append(out, explicit)
				pairedToolCalls = append(pairedToolCalls, toolCall)
				continue
			}
		if fallbackByID != nil {
			if content, ok := fallbackByID[toolCallID]; ok {
				out = append(out, openai.ToolMessage(content, toolCallID))
				pairedToolCalls = append(pairedToolCalls, toolCall)
				continue
			}
		}
		out = append(out, openai.ToolMessage(`{"error":"tool execution did not produce a result"}`, toolCallID))
		pairedToolCalls = append(pairedToolCalls, toolCall)
		}

		assistantMessage := out[assistantIndex]
		if assistantMessage.OfAssistant != nil {
			assistantMessage.OfAssistant.ToolCalls = pairedToolCalls
		}
		out[assistantIndex] = assistantMessage
		i = j
	}
	return out
}
