package engine

import (
	"context"
	"encoding/json"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
)

const ArkMetadataKey = "ark.mckinsey.com/execution-engine"

type AgentConfig struct {
	Name      string         `json:"name"`
	Namespace string         `json:"namespace"`
	Prompt    string         `json:"prompt"`
	Model     map[string]any `json:"model"`
}

type EngineMetadata struct {
	Agent AgentConfig      `json:"agent"`
	Tools []map[string]any `json:"tools,omitempty"`
}

type Engine struct{}

var _ taskmanager.MessageProcessor = (*Engine)(nil)

func (e *Engine) ProcessMessage(ctx context.Context, message protocol.Message, options taskmanager.ProcessOptions, handler taskmanager.TaskHandler) (*taskmanager.MessageProcessingResult, error) {
	var meta EngineMetadata
	if message.Metadata != nil {
		if arkData, ok := message.Metadata[ArkMetadataKey]; ok {
			raw, _ := json.Marshal(arkData)
			json.Unmarshal(raw, &meta)
		}
	}

	taskID, err := handler.BuildTask(nil, message.ContextID)
	if err != nil {
		return nil, err
	}

	userText := extractText(message)

	// TODO: Replace with your LLM provider call
	responseText := "Hello from my custom engine! You said: " + userText

	responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		&protocol.TextPart{Kind: protocol.KindText, Text: responseText},
	})

	handler.UpdateTaskState(&taskID, protocol.TaskStateCompleted, &responseMsg)

	return &taskmanager.MessageProcessingResult{}, nil
}

func extractText(msg protocol.Message) string {
	for _, part := range msg.Parts {
		if tp, ok := part.(*protocol.TextPart); ok {
			return tp.Text
		}
	}
	return ""
}
