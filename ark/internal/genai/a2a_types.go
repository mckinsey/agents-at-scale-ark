/* Copyright 2025. McKinsey & Company */

package genai

import (
	"trpc.group/trpc-go/trpc-a2a-go/server"
)

// Use the official A2A library types
type (
	A2AAgentCard = server.AgentCard
	A2ASkill     = server.AgentSkill
)

// Legacy types - these are now handled by the library internally
// Keeping minimal compatibility types only
