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

var mcpserverlog = logf.Log.WithName("mcpserver-resource")

func SetupMCPServerWebhookWithManager(mgr ctrl.Manager) error {
	k8sClient := mgr.GetClient()
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1alpha1.MCPServer{}).
		WithValidator(&MCPServerValidator{
			Client:   k8sClient,
			Resolver: common.NewValueSourceResolver(k8sClient),
		}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-mcpserver,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=mcpserver,verbs=create;update,versions=v1alpha1,name=vmcpserver-v1.kb.io,admissionReviewVersions=v1

type MCPServerValidator struct {
	Client   client.Client
	Resolver *common.ValueSourceResolver
}

var _ webhook.CustomValidator = &MCPServerValidator{}

func (v *MCPServerValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	mcpserver, ok := obj.(*arkv1alpha1.MCPServer)
	if !ok {
		return nil, fmt.Errorf("expected a MCPServer object but got %T", obj)
	}

	mcpserverlog.Info("Validating MCPServer", "name", mcpserver.GetName(), "namespace", mcpserver.GetNamespace())

	_, err := v.Resolver.ResolveValueSource(ctx, mcpserver.Spec.Address, mcpserver.GetNamespace())
	if err != nil {
		mcpserverlog.Error(err, "Failed to resolve Address", "mcpserver", mcpserver.GetName())
		return nil, fmt.Errorf("failed to resolve Address: %w", err)
	}

	for i, header := range mcpserver.Spec.Headers {
		contextPrefix := fmt.Sprintf("headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			mcpserverlog.Error(err, "Failed to validate header", "mcpserver", mcpserver.GetName(), "header", header.Name)
			return nil, err
		}
	}

	// Validate PollInterval
	if err := ValidatePollInterval(mcpserver.Spec.PollInterval.Duration); err != nil {
		mcpserverlog.Error(err, "Failed to validate pollInterval", "mcpserver", mcpserver.GetName())
		return nil, fmt.Errorf("failed to validate pollInterval: %w", err)
	}

	mcpserverlog.Info("MCPServer validation complete", "name", mcpserver.GetName())

	return nil, nil
}

func (v *MCPServerValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	return v.ValidateCreate(ctx, newObj)
}

func (v *MCPServerValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	return nil, nil
}
