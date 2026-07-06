package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
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

	warnings = append(warnings, CollectMigrationWarnings(agent.Annotations)...)
	return warnings, nil
}

func validateAgentTool(index int, tool arkv1alpha1.AgentTool) error {
	hasName := tool.Name != ""

	switch tool.Type {
	case "built-in":
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
