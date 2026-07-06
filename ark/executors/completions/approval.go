package completions

import (
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// ApprovalRequiredError is returned when a tool call requires human approval before execution
type ApprovalRequiredError struct {
	ToolCalls []ToolCall
	Config    *arkv1alpha1.ToolApprovalConfig
	Context   *ExecutionContext
}

func (e *ApprovalRequiredError) Error() string {
	return fmt.Sprintf("approval required for %d tool call(s)", len(e.ToolCalls))
}

// ExecutionContext contains minimal context needed to resume execution after approval
type ExecutionContext struct {
	ConversationID       string
	PendingToolCallIndex int
	CompletedToolResults []ToolResult
	AgentName            string
	AgentNamespace       string
}

// requiresApproval checks if a tool requires approval using O(1) lookup
func (a *Agent) requiresApproval(toolName string) *arkv1alpha1.ToolApprovalConfig {
	if a.approvalRequiredTools == nil {
		return nil
	}
	return a.approvalRequiredTools[toolName]
}
