/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"encoding/json"

	"trpc.group/trpc-go/trpc-a2a-go/server"
)

const ExecutionEngineA2A = "a2a"

const ExecutionContextExtensionURI = "ark.mckinsey.com/extensions/execution-context/v1"

const (
	TaskStateSubmitted     = "submitted"
	TaskStateWorking       = "working"
	TaskStateInputRequired = "input-required"
	TaskStateCompleted     = "completed"
	TaskStateCanceled      = "canceled"
	TaskStateFailed        = "failed"
	TaskStateRejected      = "rejected"
	TaskStateAuthRequired  = "auth-required"
)

type ExecutionResponsePayload struct {
	TokenUsage         *ResponseTokenUsage `json:"tokenUsage,omitempty"`
	ConversationId     string              `json:"conversationId,omitempty"`
	Messages           any                 `json:"messages,omitempty"`
	ResponseMessagesV1 json.RawMessage     `json:"responseMessagesV1,omitempty"`
}

type ResponseTokenUsage struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
}

type (
	A2AAgentCard = server.AgentCard
)
