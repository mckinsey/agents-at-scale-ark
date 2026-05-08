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
	case toolTypeCustom, "mcp", "http", "agent", "team", "builtin":
		if !hasName {
			return fmt.Errorf("tool[%d]: %s tools must specify a name", index, tool.Type)
		}
	default:
		return fmt.Errorf("tool[%d]: unsupported tool type '%s': supported types are: built-in, mcp, http, agent, team, builtin", index, tool.Type)
	}

	if tool.Interaction != nil {
		if err := validateToolInteractionConfig(index, tool.Interaction); err != nil {
			return err
		}
	}

	return nil
}

func validateToolInteractionConfig(index int, config *arkv1alpha1.ToolInteractionConfig) error {
	switch config.Type {
	case "approval":
		if config.Input != nil || config.Selection != nil || config.Confirmation != nil {
			return fmt.Errorf("tool[%d]: interaction type is 'approval' but has non-approval config (input/selection/confirmation)", index)
		}
	case "input":
		if config.Approval != nil || config.Selection != nil || config.Confirmation != nil {
			return fmt.Errorf("tool[%d]: interaction type is 'input' but has non-input config (approval/selection/confirmation)", index)
		}
	case "selection":
		if config.Approval != nil || config.Input != nil || config.Confirmation != nil {
			return fmt.Errorf("tool[%d]: interaction type is 'selection' but has non-selection config (approval/input/confirmation)", index)
		}
		if config.Selection == nil || len(config.Selection.Options) == 0 {
			return fmt.Errorf("tool[%d]: interaction type is 'selection' but no options provided", index)
		}
	case "confirmation":
		if config.Approval != nil || config.Input != nil || config.Selection != nil {
			return fmt.Errorf("tool[%d]: interaction type is 'confirmation' but has non-confirmation config (approval/input/selection)", index)
		}
	default:
		return fmt.Errorf("tool[%d]: invalid interaction type '%s': must be approval, input, selection, or confirmation", index, config.Type)
	}
	return nil
}

func isValidBuiltInTool(name string) bool {
	return name == "noop" || name == "terminate"
}
