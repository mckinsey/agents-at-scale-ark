package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func (v *Validator) ValidateEvaluator(ctx context.Context, evaluator *arkv1alpha1.Evaluator) ([]string, error) {
	if _, err := v.ResolveValueSource(ctx, evaluator.Spec.Address, evaluator.GetNamespace()); err != nil {
		return nil, fmt.Errorf("failed to resolve Address: %w", err)
	}

	var modelName, modelNamespace string
	modelNamespace = evaluator.GetNamespace()

	for _, param := range evaluator.Spec.Parameters {
		switch param.Name {
		case "model.name":
			if param.Value != "" {
				modelName = param.Value
			}
		case "model.namespace":
			if param.Value != "" {
				modelNamespace = param.Value
			}
		}
	}

	if modelName != "" {
		if err := v.ResourceExists(ctx, "Model", modelNamespace, modelName); err != nil {
			return nil, fmt.Errorf("failed to validate model '%s': %w", modelName, err)
		}
	}

	return nil, nil
}
