package genai

import "trpc.group/trpc-go/trpc-a2a-go/protocol"

type ExecutionResult struct {
	Messages              []Message
	A2AMessages           []protocol.Message `json:"-"`
	A2AResponse           *A2AResponse
	DelegatedA2AContextID string                   `json:"-"`
	DelegatedA2ATaskIDs   []string                 `json:"-"`
	DelegatedA2AArtifacts []map[string]interface{} `json:"-"`
}
