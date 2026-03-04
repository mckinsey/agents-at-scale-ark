package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	TargetTypeAgent = "agent"
	TargetTypeTeam  = "team"
	TargetTypeModel = "model"
	TargetTypeTool  = "tool"
)

func (v *Validator) ValidateQuery(ctx context.Context, query *arkv1alpha1.Query) ([]string, error) {
	if !query.DeletionTimestamp.IsZero() {
		return nil, nil
	}
	if err := v.validateQueryTargets(ctx, query); err != nil {
		return nil, err
	}
	if err := v.ValidateParameters(ctx, query.Namespace, query.Spec.Parameters); err != nil {
		return nil, err
	}
	if err := ValidateOverrides(query.Spec.Overrides); err != nil {
		return nil, err
	}
	return nil, nil
}

func (v *Validator) validateQueryTargets(ctx context.Context, query *arkv1alpha1.Query) error {
	if query.Spec.Target == nil && query.Spec.Selector == nil {
		return fmt.Errorf("target or selector must be specified")
	}

	if query.Spec.Target != nil {
		target := query.Spec.Target
		switch target.Type {
		case TargetTypeAgent:
			if err := v.ResourceExists(ctx, "Agent", query.Namespace, target.Name); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeTeam:
			if err := v.ResourceExists(ctx, "Team", query.Namespace, target.Name); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeModel:
			if err := v.ResourceExists(ctx, "Model", query.Namespace, target.Name); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeTool:
			if err := v.ResourceExists(ctx, "Tool", query.Namespace, target.Name); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		default:
			return fmt.Errorf("target: unsupported type '%s': supported types are: %s, %s, %s, %s", target.Type, TargetTypeAgent, TargetTypeTeam, TargetTypeModel, TargetTypeTool)
		}
	}

	return nil
}
