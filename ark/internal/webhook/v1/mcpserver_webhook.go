package v1

import (
	ctrl "sigs.k8s.io/controller-runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

// +kubebuilder:webhook:path=/mutate-ark-mckinsey-com-v1alpha1-mcpserver,mutating=true,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=mcpservers,verbs=create;update,versions=v1alpha1,name=mmcpserver-v1.kb.io,admissionReviewVersions=v1

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-mcpserver,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=mcpservers,verbs=create;update,versions=v1alpha1,name=vmcpserver-v1.kb.io,admissionReviewVersions=v1

func SetupMCPServerWebhookWithManager(mgr ctrl.Manager) error {
	lookup := &validation.WebhookLookup{Client: mgr.GetClient()}
	v := validation.NewValidator(lookup)
	return ctrl.NewWebhookManagedBy(mgr, &arkv1alpha1.MCPServer{}).
		WithDefaulter(&validation.WebhookDefaulter[*arkv1alpha1.MCPServer]{Lookup: lookup}).
		WithValidator(&validation.WebhookValidator[*arkv1alpha1.MCPServer]{V: v}).
		Complete()
}
