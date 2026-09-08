package completions

import (
	"encoding/json"
	"fmt"
	"regexp"
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

// requiresApproval checks if a tool call requires approval. A tool is looked up in
// O(1); if its config declares argument matchers, approval is required only when the
// call's arguments match one of them.
func (a *Agent) requiresApproval(toolName, arguments string) *arkv1alpha1.ToolApprovalConfig {
	if a.approvalRequiredTools == nil {
		return nil
	}
	config := a.approvalRequiredTools[toolName]
	if config == nil {
		return nil
	}
	if !matchesApprovalArguments(config, arguments) {
		return nil
	}
	return config
}

// matchesApprovalArguments reports whether a gated tool call should be held. With no
// matchers every call is held (the original behaviour). With matchers, a call is held
// when any matcher's regex matches the named argument's value. Arguments that fail to
// parse are held rather than waved through, so a malformed call to a gated tool cannot
// slip past the matcher check.
func matchesApprovalArguments(config *arkv1alpha1.ToolApprovalConfig, arguments string) bool {
	if len(config.ArgumentMatches) == 0 {
		return true
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(arguments), &parsed); err != nil {
		return true
	}

	for _, matcher := range config.ArgumentMatches {
		value, ok := parsed[matcher.Argument]
		if !ok {
			continue
		}
		if matched, err := regexp.MatchString(matcher.Pattern, fmt.Sprintf("%v", value)); err == nil && matched {
			return true
		}
	}
	return false
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
	merged.ArgumentMatches = mergeArgumentMatches(fromTool, fromAgent)
	return &merged
}

// mergeArgumentMatches unions the matcher lists so an agent cannot narrow away a gate the
// Tool declares. A side that is Required with no matchers wants every call held, so it
// wins: the merged config carries no matchers (gate all). Otherwise the merged matchers
// are the union of both sides.
func mergeArgumentMatches(fromTool, fromAgent *arkv1alpha1.ToolApprovalConfig) []arkv1alpha1.ArgumentMatch {
	if fromTool.Required && len(fromTool.ArgumentMatches) == 0 {
		return nil
	}
	if fromAgent.Required && len(fromAgent.ArgumentMatches) == 0 {
		return nil
	}
	merged := make([]arkv1alpha1.ArgumentMatch, 0, len(fromTool.ArgumentMatches)+len(fromAgent.ArgumentMatches))
	merged = append(merged, fromTool.ArgumentMatches...)
	merged = append(merged, fromAgent.ArgumentMatches...)
	if len(merged) == 0 {
		return nil
	}
	return merged
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
