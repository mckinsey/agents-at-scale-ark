package completions

import (
	"context"
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

// buildA2ATaskForApproval creates an A2ATask resource for approval tracking
func buildA2ATaskForApproval(
	ctx context.Context,
	queryName string,
	queryNamespace string,
	agentName string,
	agentNamespace string,
	toolCalls []ToolCall,
	config *arkv1alpha1.ToolApprovalConfig,
	execContext *ExecutionContext,
) (*arkv1alpha1.A2ATask, error) {
	// TODO: Implement A2ATask creation
	// This will be implemented in the controller integration phase
	return nil, fmt.Errorf("not implemented")
}
