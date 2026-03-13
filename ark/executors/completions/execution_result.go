package completions

import (
	arka2a "mckinsey.com/ark/internal/a2a"
)

type ExecutionResult struct {
	Messages    []Message
	A2AResponse *arka2a.A2AResponse
}
