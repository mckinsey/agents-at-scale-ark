package v1

import (
	ctrl "sigs.k8s.io/controller-runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-evaluator,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=evaluators,verbs=create;update,versions=v1alpha1,name=vevaluator-v1alpha1.kb.io,admissionReviewVersions=v1

func SetupEvaluatorWebhookWithManager(mgr ctrl.Manager) error {
	v := validation.NewValidator(&validation.WebhookLookup{Client: mgr.GetClient()})
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1alpha1.Evaluator{}).
		WithValidator(&validation.WebhookValidator{V: v}).
		Complete()
}
