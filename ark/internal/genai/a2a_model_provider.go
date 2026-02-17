package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type A2AToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type A2ATurnResult struct {
	Message   protocol.Message
	ToolCalls []A2AToolCall
	Content   string
}

type A2AModelProvider interface {
	A2ATurn(ctx context.Context, messages []protocol.Message, tools []A2AToolDefinition, eventStream EventStreamInterface) (*A2ATurnResult, error)
}

type A2AToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

var ErrA2AModelProviderNotSupported = fmt.Errorf("provider does not support A2A model interface")
