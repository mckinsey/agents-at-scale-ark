package validation

import (
	"context"
	"fmt"
	"strings"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

func (v *Validator) ValidateAgent(ctx context.Context, agent *arkv1alpha1.Agent) ([]string, error) {
	var warnings []string

	if err := v.ValidateParameters(ctx, agent.Namespace, agent.Spec.Parameters); err != nil {
		return warnings, err
	}

	if err := ValidateOverrides(agent.Spec.Overrides); err != nil {
		return warnings, err
	}

	for i, tool := range agent.Spec.Tools {
		if err := validateAgentTool(i, tool); err != nil {
			return warnings, err
		}
	}

	warnings = append(warnings, v.engineToolWarnings(ctx, agent)...)

	warnings = append(warnings, CollectMigrationWarnings(agent.Annotations)...)
	return warnings, nil
}

func (v *Validator) engineToolWarnings(ctx context.Context, agent *arkv1alpha1.Agent) []string {
	if !arka2a.IsNamedEngine(agent.Spec.ExecutionEngine) {
		return nil
	}

	dropped := make([]string, 0, len(agent.Spec.Tools))
	partials := make([]string, 0, len(agent.Spec.Tools))
	for _, tool := range agent.Spec.Tools {
		toolType := v.resolveAgentToolType(ctx, agent.Namespace, tool)
		reported := tool.Name
		if toolType != "" {
			reported = fmt.Sprintf("%s (%s)", tool.Name, toolType)
		}

		if tool.Partial != nil {
			partials = append(partials, reported)
			continue
		}
		if toolType == "" || toolType == ToolTypeMCP {
			continue
		}
		dropped = append(dropped, reported)
	}

	var warnings []string
	if len(dropped) > 0 {
		warnings = append(warnings, fmt.Sprintf(
			"agent '%s': execution engine '%s' receives only mcp tools; these tools will not be available to the agent: %s",
			agent.Name,
			agent.Spec.ExecutionEngine.Name,
			strings.Join(dropped, ", "),
		))
	}
	if len(partials) > 0 {
		warnings = append(warnings, fmt.Sprintf(
			"agent '%s': execution engine '%s' connects to mcp servers directly, so partial tools cannot have their preset parameters injected or hidden; these tools will not be available to the agent: %s",
			agent.Name,
			agent.Spec.ExecutionEngine.Name,
			strings.Join(partials, ", "),
		))
	}
	return warnings
}

func (v *Validator) resolveAgentToolType(ctx context.Context, namespace string, tool arkv1alpha1.AgentTool) string {
	if tool.Type != toolTypeCustom && tool.Type != toolTypeBuiltIn {
		return tool.Type
	}

	obj, err := v.Lookup.GetResource(ctx, "Tool", namespace, tool.GetToolCRDName())
	if err != nil {
		return ""
	}
	toolCRD, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return ""
	}
	return toolCRD.Spec.Type
}

func validateAgentTool(index int, tool arkv1alpha1.AgentTool) error {
	hasName := tool.Name != ""

	switch tool.Type {
	case toolTypeBuiltIn:
		if !hasName {
			return fmt.Errorf("tool[%d]: built-in tools must specify a name", index)
		}
		if !isValidBuiltInTool(tool.Name) {
			return fmt.Errorf("tool[%d]: unsupported built-in tool '%s': supported built-in tools are: noop, terminate", index, tool.Name)
		}
		return nil
	case toolTypeCustom, "mcp", "http", "agent", "team", "builtin":
		if !hasName {
			return fmt.Errorf("tool[%d]: %s tools must specify a name", index, tool.Type)
		}
		if err := validateToolApprovalConfig(index, tool); err != nil {
			return err
		}
		return nil
	default:
		return fmt.Errorf("tool[%d]: unsupported tool type '%s': supported types are: built-in, mcp, http, agent, team, builtin", index, tool.Type)
	}
}

func validateToolApprovalConfig(index int, tool arkv1alpha1.AgentTool) error {
	if tool.Approval == nil {
		return nil
	}

	approval := tool.Approval

	// Validate timeout is positive if specified
	if approval.Timeout != nil && approval.Timeout.Duration <= 0 {
		return fmt.Errorf("tool[%d]: approval.timeout must be a positive duration", index)
	}

	// Validate onTimeout enum
	if approval.OnTimeout != "" && approval.OnTimeout != "reject" && approval.OnTimeout != "proceed" {
		return fmt.Errorf("tool[%d]: approval.onTimeout must be 'reject' or 'proceed'", index)
	}

	return nil
}

func isValidBuiltInTool(name string) bool {
	return name == "noop" || name == "terminate"
}
