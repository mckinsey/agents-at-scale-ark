package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type EvaluatorValidator struct {
	*StorageValidator
}

func NewEvaluatorValidator(sv *StorageValidator) *EvaluatorValidator {
	return &EvaluatorValidator{StorageValidator: sv}
}

func (v *EvaluatorValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	evaluator, ok := obj.(*arkv1alpha1.Evaluator)
	if !ok {
		return fmt.Errorf("expected an Evaluator object but got %T", obj)
	}
	return v.validateEvaluator(ctx, evaluator)
}

func (v *EvaluatorValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	evaluator, ok := newObj.(*arkv1alpha1.Evaluator)
	if !ok {
		return fmt.Errorf("expected an Evaluator object but got %T", newObj)
	}
	return v.validateEvaluator(ctx, evaluator)
}

func (v *EvaluatorValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *EvaluatorValidator) validateEvaluator(ctx context.Context, evaluator *arkv1alpha1.Evaluator) error {
	if err := v.validateAddress(ctx, evaluator); err != nil {
		return err
	}

	if err := v.validateModelReference(ctx, evaluator); err != nil {
		return err
	}

	return nil
}

func (v *EvaluatorValidator) validateAddress(ctx context.Context, evaluator *arkv1alpha1.Evaluator) error {
	return v.ValidateAddress(ctx, evaluator.Spec.Address, evaluator.Namespace)
}

func (v *EvaluatorValidator) validateModelReference(ctx context.Context, evaluator *arkv1alpha1.Evaluator) error {
	var modelName, modelNamespace string
	modelNamespace = evaluator.Namespace

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
		if err := v.ValidateModelExists(ctx, modelName, modelNamespace); err != nil {
			return fmt.Errorf("failed to validate model '%s': %w", modelName, err)
		}
	}

	return nil
}
