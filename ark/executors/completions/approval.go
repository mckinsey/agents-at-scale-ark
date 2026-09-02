package completions

import (
	"fmt"
	"strings"

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

// buildApprovalMap resolves the approval config for each of an agent's tools.
//
// Approval can be declared on the Tool CRD (applies to every agent using it) or on the
// agent's reference to that tool. The two are unioned on Required, so an agent cannot
// drop a gate the Tool declares; Timeout and OnTimeout come from the agent when set,
// otherwise from the Tool.
func buildApprovalMap(agentTools []arkv1alpha1.AgentTool, registry *ToolRegistry) map[string]*arkv1alpha1.ToolApprovalConfig {
	approvalMap := make(map[string]*arkv1alpha1.ToolApprovalConfig)
	for _, agentTool := range agentTools {
		merged := mergeApprovalConfig(registry.ToolApproval(agentTool.Name), agentTool.Approval)
		if merged != nil && merged.Required {
			approvalMap[agentTool.Name] = merged
		}
	}
	return approvalMap
}

func mergeApprovalConfig(fromTool, fromAgent *arkv1alpha1.ToolApprovalConfig) *arkv1alpha1.ToolApprovalConfig {
	if fromTool == nil {
		return fromAgent
	}
	if fromAgent == nil {
		return fromTool
	}

	merged := *fromTool
	merged.Required = fromTool.Required || fromAgent.Required
	if fromAgent.Timeout != nil {
		merged.Timeout = fromAgent.Timeout
	}
	if fromAgent.OnTimeout != "" {
		merged.OnTimeout = fromAgent.OnTimeout
	}
	return &merged
}

func approvalToolNames(err *ApprovalRequiredError) string {
	names := make([]string, 0, len(err.ToolCalls))
	for _, tc := range err.ToolCalls {
		if tc.Function.Name != "" {
			names = append(names, tc.Function.Name)
		}
	}
	if len(names) == 0 {
		return fmt.Sprintf("%d tool call(s)", len(err.ToolCalls))
	}
	return "tool " + strings.Join(names, ", ")
}

func subTargetApprovalError(targetName string, err *ApprovalRequiredError) error {
	return fmt.Errorf("agent %s requires approval for %s, which is not supported for an agent invoked as a sub-target: the calling engine owns the approval cycle and has no way to resume us",
		targetName, approvalToolNames(err))
}
