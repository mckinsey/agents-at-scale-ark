package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	TargetTypeAgent = "agent"
	TargetTypeTeam  = "team"
	TargetTypeModel = "model"
	TargetTypeTool  = "tool"
)

type QueryValidator struct {
	*StorageValidator
}

func NewQueryValidator(sv *StorageValidator) *QueryValidator {
	return &QueryValidator{StorageValidator: sv}
}

func (v *QueryValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	query, ok := obj.(*arkv1alpha1.Query)
	if !ok {
		return fmt.Errorf("expected a Query object but got %T", obj)
	}
	return v.validateQuery(ctx, query)
}

func (v *QueryValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	query, ok := newObj.(*arkv1alpha1.Query)
	if !ok {
		return fmt.Errorf("expected a Query object but got %T", newObj)
	}
	if query.DeletionTimestamp.IsZero() {
		return v.validateQuery(ctx, query)
	}
	return nil
}

func (v *QueryValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *QueryValidator) validateQuery(ctx context.Context, query *arkv1alpha1.Query) error {
	if err := v.validateQueryTargets(ctx, query); err != nil {
		return err
	}

	if err := v.ValidateParameters(ctx, query.Namespace, query.Spec.Parameters); err != nil {
		return err
	}

	if err := ValidateOverrides(query.Spec.Overrides); err != nil {
		return err
	}

	return nil
}

func (v *QueryValidator) validateQueryTargets(ctx context.Context, query *arkv1alpha1.Query) error {
	if query.Spec.Target == nil && query.Spec.Selector == nil {
		return fmt.Errorf("target or selector must be specified")
	}

	if query.Spec.Target != nil {
		target := query.Spec.Target
		switch target.Type {
		case TargetTypeAgent:
			if err := v.ValidateAgentExists(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeTeam:
			if err := v.ValidateTeamExists(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeModel:
			if err := v.ValidateModelExists(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeTool:
			if err := v.ValidateToolExists(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		default:
			return fmt.Errorf("target: unsupported type '%s': supported types are: %s, %s, %s, %s", target.Type, TargetTypeAgent, TargetTypeTeam, TargetTypeModel, TargetTypeTool)
		}
	}

	return nil
}
