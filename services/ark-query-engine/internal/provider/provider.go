package provider

import (
	"context"
	"fmt"

	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type ToolOutcome struct {
	ToolCallID string                 `json:"toolCallId"`
	ToolName   string                 `json:"toolName"`
	Content    string                 `json:"content,omitempty"`
	Error      string                 `json:"error,omitempty"`
	TaskID     string                 `json:"taskId,omitempty"`
	ContextID  string                 `json:"contextId,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type TurnUsage struct {
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64
}

type TurnResult struct {
	Message   a2aprotocol.Message
	ToolCalls []ToolCall
	Content   string
	Usage     *TurnUsage
}

type ToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

type StreamChunkHandler func(chunk any) error

type ModelProvider interface {
	Turn(ctx context.Context, messages []a2aprotocol.Message, toolOutcomes []ToolOutcome, tools []ToolDefinition, streamHandler StreamChunkHandler) (*TurnResult, error)
}

var ErrModelProviderNotSupported = fmt.Errorf("provider does not support model interface")
