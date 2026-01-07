/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	TargetTypeAgent = "agent"
	TargetTypeTeam  = "team"
	TargetTypeModel = "model"
	TargetTypeTool  = "tool"
)

// SetupQueryWebhookWithManager registers the webhook for Query in the manager.
func SetupQueryWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).For(&arkv1alpha1.Query{}).
		WithValidator(&QueryCustomValidator{ResourceValidator: &ResourceValidator{Client: mgr.GetClient()}}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-query,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=queries,verbs=create;update,versions=v1alpha1,name=vquery-v1.kb.io,admissionReviewVersions=v1

// QueryCustomValidator struct is responsible for validating the Query resource
// when it is created, updated, or deleted.
//
// NOTE: The +kubebuilder:object:generate=false marker prevents controller-gen from generating DeepCopy methods,
// as this struct is used only for temporary operations and does not need to be deeply copied.
type QueryCustomValidator struct {
	*ResourceValidator
}

var _ webhook.CustomValidator = &QueryCustomValidator{}

func (v *QueryCustomValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	query, ok := obj.(*arkv1alpha1.Query)
	if !ok {
		return nil, fmt.Errorf("expected a Query object but got %T", obj)
	}
	log.V(3).Info("Validate create", "query", query.ObjectMeta)

	return v.validateQuery(ctx, query)
}

func (v *QueryCustomValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	query, ok := newObj.(*arkv1alpha1.Query)
	if !ok {
		return nil, fmt.Errorf("expected a Query object for the newObj but got %T", newObj)
	}
	log.V(3).Info("Validate update", "query", query.ObjectMeta)
	if query.DeletionTimestamp.IsZero() {
		return v.validateQuery(ctx, query)
	}
	return nil, nil
}

func (v *QueryCustomValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	query, ok := obj.(*arkv1alpha1.Query)
	if !ok {
		return nil, fmt.Errorf("expected a Query object but got %T", obj)
	}
	log.V(3).Info("Delete", "name", query.ObjectMeta)

	return nil, nil
}

func (v *QueryCustomValidator) validateQuery(ctx context.Context, query *arkv1alpha1.Query) (admission.Warnings, error) {
	var warnings admission.Warnings

	if err := v.validateQueryTargets(ctx, query); err != nil {
		return warnings, err
	}

	if err := v.ValidateParameters(ctx, query.Namespace, query.Spec.Parameters); err != nil {
		return warnings, err
	}

	if err := v.ValidateOverrides(query.Spec.Overrides); err != nil {
		return warnings, err
	}

	return warnings, nil
}

func (v *QueryCustomValidator) validateQueryTargets(ctx context.Context, query *arkv1alpha1.Query) error {
	if query.Spec.Target == nil && query.Spec.Selector == nil {
		return fmt.Errorf("target or selector must be specified")
	}

	if query.Spec.Target != nil {
		target := query.Spec.Target
		switch target.Type {
		case TargetTypeAgent:
			if err := v.ValidateLoadAgent(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeTeam:
			if err := v.ValidateLoadTeam(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeModel:
			if err := v.ValidateLoadModel(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		case TargetTypeTool:
			if err := v.ValidateLoadTool(ctx, target.Name, query.Namespace); err != nil {
				return fmt.Errorf("target references %v", err)
			}
		default:
			return fmt.Errorf("target: unsupported type '%s': supported types are: %s, %s, %s, %s", target.Type, TargetTypeAgent, TargetTypeTeam, TargetTypeModel, TargetTypeTool)
		}
	}

	return nil
}
