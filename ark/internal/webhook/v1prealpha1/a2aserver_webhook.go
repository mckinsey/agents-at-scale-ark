package v1prealpha1

import (
	ctrl "sigs.k8s.io/controller-runtime"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/validation"
)

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1prealpha1-a2aserver,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=a2aservers,verbs=create;update,versions=v1prealpha1,name=va2aserver-v1prealpha1.kb.io,admissionReviewVersions=v1

func SetupA2AServerWebhookWithManager(mgr ctrl.Manager) error {
	v := validation.NewValidator(&validation.WebhookLookup{Client: mgr.GetClient()})
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1prealpha1.A2AServer{}).
		WithValidator(&validation.WebhookValidator{V: v}).
		Complete()
}
