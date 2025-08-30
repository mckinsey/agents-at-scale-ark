/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

var evaluatorLog = logf.Log.WithName("evaluator-resource")

func SetupEvaluatorWebhookWithManager(mgr ctrl.Manager) error {
	k8sClient := mgr.GetClient()
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1alpha1.Evaluator{}).
		WithValidator(&EvaluatorValidator{
			Client:            k8sClient,
			Resolver:          common.NewValueSourceResolver(k8sClient),
			ResourceValidator: &ResourceValidator{Client: k8sClient},
		}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-evaluator,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=evaluators,verbs=create;update,versions=v1alpha1,name=vevaluator-v1alpha1.kb.io,admissionReviewVersions=v1

type EvaluatorValidator struct {
	Client   client.Client
	Resolver *common.ValueSourceResolver
	*ResourceValidator
}

var _ webhook.CustomValidator = &EvaluatorValidator{}

func (v *EvaluatorValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	evaluator, ok := obj.(*arkv1alpha1.Evaluator)
	if !ok {
		return nil, fmt.Errorf("expected an Evaluator object but got %T", obj)
	}

	evaluatorLog.Info("Validating Evaluator", "name", evaluator.GetName(), "namespace", evaluator.GetNamespace())

	// Validate that the address can be resolved
	_, err := v.Resolver.ResolveValueSource(ctx, evaluator.Spec.Address, evaluator.GetNamespace())
	if err != nil {
		evaluatorLog.Error(err, "Failed to resolve Address", "evaluator", evaluator.GetName())
		return nil, fmt.Errorf("failed to resolve Address: %w", err)
	}

	// Validate model reference from parameters - only if explicitly specified
	var modelName, modelNamespace string
	modelNamespace = evaluator.GetNamespace()

	// Check for model parameters
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

	// Only validate model if explicitly specified in parameters
	if modelName != "" {
		if err := v.ValidateLoadModel(ctx, modelName, modelNamespace); err != nil {
			evaluatorLog.Error(err, "Failed to validate model", "evaluator", evaluator.GetName(), "model", modelName)
			return nil, fmt.Errorf("failed to validate model '%s': %w", modelName, err)
		}
	}

	evaluatorLog.Info("Evaluator validation complete", "name", evaluator.GetName())

	return nil, nil
}

func (v *EvaluatorValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	return v.ValidateCreate(ctx, newObj)
}

func (v *EvaluatorValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	return nil, nil
}
