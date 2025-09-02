/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type EvaluationValidator struct {
	*ResourceValidator
}

var _ webhook.CustomValidator = &EvaluationValidator{}

func (v *EvaluationValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	evaluation, ok := obj.(*arkv1alpha1.Evaluation)
	if !ok {
		return nil, fmt.Errorf("expected Evaluation, got %T", obj)
	}

	log := logf.FromContext(ctx)
	log.Info("Validating Evaluation creation", "name", evaluation.Name)

	return v.validateEvaluation(ctx, evaluation)
}

func (v *EvaluationValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	evaluation, ok := newObj.(*arkv1alpha1.Evaluation)
	if !ok {
		return nil, fmt.Errorf("expected Evaluation, got %T", newObj)
	}

	log := logf.FromContext(ctx)
	log.Info("Validating Evaluation update", "name", evaluation.Name)

	return v.validateEvaluation(ctx, evaluation)
}

func (v *EvaluationValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	// No special validation needed for deletion
	return nil, nil
}

func (v *EvaluationValidator) validateEvaluation(ctx context.Context, evaluation *arkv1alpha1.Evaluation) (admission.Warnings, error) {
	var warnings admission.Warnings

	// Validate evaluator reference
	if err := v.validateEvaluatorReference(ctx, evaluation); err != nil {
		return warnings, err
	}

	// Validate type-specific requirements
	switch evaluation.Spec.Type {
	case "direct", "": // Default to direct type
		if err := v.validateDirectMode(evaluation); err != nil {
			return warnings, err
		}
	case "query":
		if err := v.validateQueryMode(evaluation); err != nil {
			return warnings, err
		}
	case "batch":
		if err := v.validateBatchMode(evaluation); err != nil {
			return warnings, err
		}
	case "baseline":
		if err := v.validateBaselineMode(evaluation); err != nil {
			return warnings, err
		}
	case "event":
		if err := v.validateEventMode(evaluation); err != nil {
			return warnings, err
		}
	default:
		return warnings, fmt.Errorf("unsupported evaluation type '%s': supported types are: direct, query, batch, baseline, event", evaluation.Spec.Type)
	}

	// Validate evaluator parameters
	if err := v.validateEvaluatorParameters(evaluation); err != nil {
		return warnings, err
	}

	return warnings, nil
}

func (v *EvaluationValidator) validateEvaluatorReference(ctx context.Context, evaluation *arkv1alpha1.Evaluation) error {
	evaluatorName := evaluation.Spec.Evaluator.Name
	evaluatorNamespace := evaluation.Spec.Evaluator.Namespace
	if evaluatorNamespace == "" {
		evaluatorNamespace = evaluation.Namespace
	}

	// Validate that the evaluator exists
	if err := v.ValidateLoadEvaluator(ctx, evaluatorName, evaluatorNamespace); err != nil {
		return fmt.Errorf("evaluator reference validation failed: %v", err)
	}

	return nil
}

func (v *EvaluationValidator) validateDirectMode(evaluation *arkv1alpha1.Evaluation) error {
	// Direct mode validation - both input and output are required in config
	if evaluation.Spec.Config.Input == "" {
		return fmt.Errorf("direct mode evaluation requires non-empty input in config")
	}

	if evaluation.Spec.Config.Output == "" {
		return fmt.Errorf("direct mode evaluation requires non-empty output in config")
	}

	// Direct mode should not have query references
	if evaluation.Spec.Config.QueryRef != nil {
		return fmt.Errorf("direct mode evaluation cannot specify queryRef in config")
	}

	return nil
}

func (v *EvaluationValidator) validateBatchMode(evaluation *arkv1alpha1.Evaluation) error {
	// Batch mode requires evaluations list in config
	if len(evaluation.Spec.Config.Evaluations) == 0 {
		return fmt.Errorf("batch mode evaluation requires non-empty evaluations list in config")
	}

	// Batch mode should not have direct input/output
	if evaluation.Spec.Config.Input != "" {
		return fmt.Errorf("batch mode evaluation cannot specify input in config")
	}

	if evaluation.Spec.Config.Output != "" {
		return fmt.Errorf("batch mode evaluation cannot specify output in config")
	}

	return nil
}

func (v *EvaluationValidator) validateQueryMode(evaluation *arkv1alpha1.Evaluation) error {
	// Query mode requires a query reference in config
	if evaluation.Spec.Config.QueryRef == nil {
		return fmt.Errorf("query mode evaluation requires queryRef in config")
	}

	// Query mode should not have direct input/output (they will be populated from query)
	if evaluation.Spec.Config.Input != "" {
		return fmt.Errorf("query mode evaluation cannot specify input in config (will be populated from query)")
	}

	if evaluation.Spec.Config.Output != "" {
		return fmt.Errorf("query mode evaluation cannot specify output in config (will be populated from query)")
	}

	return nil
}

func (v *EvaluationValidator) validateBaselineMode(evaluation *arkv1alpha1.Evaluation) error {
	// Baseline mode validation - currently no specific requirements
	return nil
}

func (v *EvaluationValidator) validateEventMode(evaluation *arkv1alpha1.Evaluation) error {
	// Event mode validation - should have rules in config
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

func SetupEvaluationWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1alpha1.Evaluation{}).
		WithValidator(&EvaluationValidator{ResourceValidator: &ResourceValidator{Client: mgr.GetClient()}}).
		Complete()
}
