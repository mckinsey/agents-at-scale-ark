package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func (v *Validator) ValidateEvaluation(ctx context.Context, evaluation *arkv1alpha1.Evaluation) ([]string, error) {
	if err := v.validateEvaluatorReference(ctx, evaluation); err != nil {
		return nil, err
	}

	switch evaluation.Spec.Type {
	case "direct", "":
		if err := validateDirectMode(evaluation); err != nil {
			return nil, err
		}
	case "query":
		if err := validateQueryMode(evaluation); err != nil {
			return nil, err
		}
	case "batch":
		if err := validateBatchMode(evaluation); err != nil {
			return nil, err
		}
	case "baseline":
		// no specific requirements
	case "event":
		if err := validateEventMode(evaluation); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported evaluation type '%s': supported types are: direct, query, batch, baseline, event", evaluation.Spec.Type)
	}

	if err := validateEvaluatorParameters(evaluation); err != nil {
		return nil, err
	}

	return nil, nil
}

func (v *Validator) validateEvaluatorReference(ctx context.Context, evaluation *arkv1alpha1.Evaluation) error {
	evaluatorName := evaluation.Spec.Evaluator.Name
	evaluatorNamespace := evaluation.Spec.Evaluator.Namespace
	if evaluatorNamespace == "" {
		evaluatorNamespace = evaluation.Namespace
	}
	if err := v.ResourceExists(ctx, "Evaluator", evaluatorNamespace, evaluatorName); err != nil {
		return fmt.Errorf("evaluator reference validation failed: %v", err)
	}
	return nil
}

func validateDirectMode(evaluation *arkv1alpha1.Evaluation) error {
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

func validateBatchMode(evaluation *arkv1alpha1.Evaluation) error {
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

func validateQueryMode(evaluation *arkv1alpha1.Evaluation) error {
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

func validateEventMode(evaluation *arkv1alpha1.Evaluation) error {
	if len(evaluation.Spec.Config.Rules) == 0 {
		return fmt.Errorf("event mode evaluation should specify rules in config")
	}
	return nil
}

func validateEvaluatorParameters(evaluation *arkv1alpha1.Evaluation) error {
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
