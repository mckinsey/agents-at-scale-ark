/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"trpc.group/trpc-go/trpc-a2a-go/server"
)

const ExecutionEngineA2A = "a2a"

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

type (
	A2AAgentCard = server.AgentCard
)
