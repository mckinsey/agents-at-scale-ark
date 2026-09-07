package completions

import "fmt"

type toolOutcome struct {
	toolName string
	message  Message
	images   []ToolResultImage
}

func appendToolOutcomes(agentMessages, newMessages *[]Message, outcomes []toolOutcome) {
	for _, outcome := range outcomes {
		*agentMessages = append(*agentMessages, outcome.message)
		*newMessages = append(*newMessages, outcome.message)
	}

	for _, outcome := range outcomes {
		if len(outcome.images) == 0 {
			continue
		}
		imageMessage := NewUserImageMessage(
			fmt.Sprintf("Image returned by the %s tool call.", outcome.toolName), outcome.images)
		*agentMessages = append(*agentMessages, imageMessage)
		*newMessages = append(*newMessages, imageMessage)
	}
}
