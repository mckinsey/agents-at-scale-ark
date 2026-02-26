package genai

import "trpc.group/trpc-go/trpc-a2a-go/protocol"

func ConvertA2AMessagesToOpenAI(messages []protocol.Message) []Message {
	converted := make([]Message, 0, len(messages))
	for i := range messages {
		msg, err := A2AToOpenAIMessage(messages[i])
		if err != nil {
			continue
		}
		converted = append(converted, msg)
	}
	return converted
}
