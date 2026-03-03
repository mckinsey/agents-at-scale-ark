package genai

import (
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func convertA2AMessagesToCompat(messages []protocol.Message) ([]Message, error) {
	compatMessages := make([]Message, 0, len(messages))
	for i := range messages {
		converted, err := A2AToOpenAIMessage(messages[i])
		if err != nil {
			return nil, fmt.Errorf("failed to convert A2A message %d to OpenAI format: %w", i, err)
		}
		compatMessages = append(compatMessages, converted)
	}
	return compatMessages, nil
}

func convertA2AMessagesToCompatMultimodal(messages []protocol.Message) ([]Message, error) {
	compatMessages := make([]Message, 0, len(messages))
	for i := range messages {
		converted, err := A2AToOpenAIMessageMultimodal(messages[i])
		if err != nil {
			return nil, fmt.Errorf("failed to convert A2A message %d to OpenAI format: %w", i, err)
		}
		compatMessages = append(compatMessages, converted)
	}
	return compatMessages, nil
}
