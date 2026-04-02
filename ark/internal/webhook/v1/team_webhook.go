package v1

import (
	ctrl "sigs.k8s.io/controller-runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

// +kubebuilder:webhook:path=/mutate-ark-mckinsey-com-v1alpha1-team,mutating=true,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=teams,verbs=create;update,versions=v1alpha1,name=mteam-v1.kb.io,admissionReviewVersions=v1

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-team,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=teams,verbs=create;update,versions=v1alpha1,name=vteam-v1.kb.io,admissionReviewVersions=v1

func SetupTeamWebhookWithManager(mgr ctrl.Manager) error {
	v := validation.NewValidator(&validation.WebhookLookup{Client: mgr.GetClient()})
	return ctrl.NewWebhookManagedBy(mgr).For(&arkv1alpha1.Team{}).
		WithDefaulter(&validation.WebhookDefaulter{}).
		WithValidator(&validation.WebhookValidator{V: v}).
		Complete()
}
