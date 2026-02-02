/* Copyright 2025. McKinsey & Company */

package genai

import (
	"trpc.group/trpc-go/trpc-a2a-go/server"
)

// ExecutionEngineA2A is the reserved name for external A2A execution engine
const ExecutionEngineA2A = "a2a"

// ExecutionEngineA2APod is the reserved name for ephemeral A2A pod execution engine
const ExecutionEngineA2APod = "a2a-pod"

// A2A Task states from the A2A protocol
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

// Use the official A2A library types
type (
	A2AAgentCard = server.AgentCard
)
