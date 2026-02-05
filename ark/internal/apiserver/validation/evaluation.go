package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type EvaluationValidator struct {
	*StorageValidator
}

func NewEvaluationValidator(sv *StorageValidator) *EvaluationValidator {
	return &EvaluationValidator{StorageValidator: sv}
}

func (v *EvaluationValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	evaluation, ok := obj.(*arkv1alpha1.Evaluation)
	if !ok {
		return fmt.Errorf("expected an Evaluation object but got %T", obj)
	}
	return v.validateEvaluation(ctx, evaluation)
}

func (v *EvaluationValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	evaluation, ok := newObj.(*arkv1alpha1.Evaluation)
	if !ok {
		return fmt.Errorf("expected an Evaluation object but got %T", newObj)
	}
	return v.validateEvaluation(ctx, evaluation)
}

func (v *EvaluationValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *EvaluationValidator) validateEvaluation(ctx context.Context, evaluation *arkv1alpha1.Evaluation) error {
	if err := v.validateEvaluatorReference(ctx, evaluation); err != nil {
		return err
	}

	switch evaluation.Spec.Type {
	case "direct", "":
		if err := v.validateDirectMode(evaluation); err != nil {
			return err
		}
	case "query":
		if err := v.validateQueryMode(evaluation); err != nil {
			return err
		}
	case "batch":
		if err := v.validateBatchMode(evaluation); err != nil {
			return err
		}
	case "baseline":
		// No specific validation
	case "event":
		if err := v.validateEventMode(evaluation); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported evaluation type '%s': supported types are: direct, query, batch, baseline, event", evaluation.Spec.Type)
	}

	if err := v.validateEvaluatorParameters(evaluation); err != nil {
		return err
	}

	return nil
}

func (v *EvaluationValidator) validateEvaluatorReference(ctx context.Context, evaluation *arkv1alpha1.Evaluation) error {
	evaluatorName := evaluation.Spec.Evaluator.Name
	evaluatorNamespace := evaluation.Spec.Evaluator.Namespace
	if evaluatorNamespace == "" {
		evaluatorNamespace = evaluation.Namespace
	}

	if err := v.ValidateEvaluatorExists(ctx, evaluatorName, evaluatorNamespace); err != nil {
		return fmt.Errorf("evaluator reference validation failed: %v", err)
	}

	return nil
}

func (v *EvaluationValidator) validateDirectMode(evaluation *arkv1alpha1.Evaluation) error {
	if evaluation.Spec.Config.Input == "" {
		return fmt.Errorf("direct mode evaluation requires non-empty input in config")
	}
	if evaluation.Spec.Config.Output == "" {
		return fmt.Errorf("direct mode evaluation requires non-empty output in config")
	}
	if evaluation.Spec.Config.QueryRef != nil {
		return fmt.Errorf("direct mode evaluation cannot specify queryRef in config")
	}
	return nil
}

func (v *EvaluationValidator) validateQueryMode(evaluation *arkv1alpha1.Evaluation) error {
	if evaluation.Spec.Config.QueryRef == nil {
		return fmt.Errorf("query mode evaluation requires queryRef in config")
	}
	if evaluation.Spec.Config.Input != "" {
		return fmt.Errorf("query mode evaluation cannot specify input in config (will be populated from query)")
	}
	if evaluation.Spec.Config.Output != "" {
		return fmt.Errorf("query mode evaluation cannot specify output in config (will be populated from query)")
	}
	return nil
}

func (v *EvaluationValidator) validateBatchMode(evaluation *arkv1alpha1.Evaluation) error {
	if len(evaluation.Spec.Config.Evaluations) == 0 {
		return fmt.Errorf("batch mode evaluation requires non-empty evaluations list in config")
	}
	if evaluation.Spec.Config.Input != "" {
		return fmt.Errorf("batch mode evaluation cannot specify input in config")
	}
	if evaluation.Spec.Config.Output != "" {
		return fmt.Errorf("batch mode evaluation cannot specify output in config")
	}
	return nil
}

func (v *EvaluationValidator) validateEventMode(evaluation *arkv1alpha1.Evaluation) error {
	if len(evaluation.Spec.Config.Rules) == 0 {
		return fmt.Errorf("event mode evaluation should specify rules in config")
	}
	return nil
}

func (v *EvaluationValidator) validateEvaluatorParameters(evaluation *arkv1alpha1.Evaluation) error {
	for i, param := range evaluation.Spec.Evaluator.Parameters {
		if param.Name == "" {
			return fmt.Errorf("evaluator parameter[%d]: name cannot be empty", i)
		}
		if param.Value == "" {
			return fmt.Errorf("evaluator parameter[%d]: value cannot be empty", i)
		}
	}
	return nil
}
