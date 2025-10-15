/* Copyright 2025. McKinsey & Company */

package genai

import (
	"trpc.group/trpc-go/trpc-a2a-go/server"
)

// ExecutionEngineA2A is the reserved name for A2A execution engine
const ExecutionEngineA2A = "a2a"

// Use the official A2A library types
type (
	A2AAgentCard = server.AgentCard
)
