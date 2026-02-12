/* Copyright 2025. McKinsey & Company */

package v1prealpha1

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	validationv1 "mckinsey.com/ark/internal/webhook/v1"
)

// log is for logging in this package.
var a2aserverlog = logf.Log.WithName("a2aserver-resource")

func SetupA2AServerWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1prealpha1.A2AServer{}).
		WithValidator(&A2AServerValidator{}).
		Complete()
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1prealpha1-a2aserver,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=a2aservers,verbs=create;update,versions=v1prealpha1,name=va2aserver-v1prealpha1.kb.io,admissionReviewVersions=v1

type A2AServerValidator struct{}

var _ webhook.CustomValidator = &A2AServerValidator{}

// ValidateCreate implements webhook.Validator so a webhook will be registered for the type
func (v *A2AServerValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	a2aServer, ok := obj.(*arkv1prealpha1.A2AServer)
	if !ok {
		return nil, fmt.Errorf("expected A2AServer, got %T", obj)
	}

	a2aserverlog.Info("validate create", "name", a2aServer.Name)
	return v.validateA2AServer(a2aServer)
}

// ValidateUpdate implements webhook.Validator so a webhook will be registered for the type
func (v *A2AServerValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	a2aServer, ok := newObj.(*arkv1prealpha1.A2AServer)
	if !ok {
		return nil, fmt.Errorf("expected A2AServer, got %T", newObj)
	}

	a2aserverlog.Info("validate update", "name", a2aServer.Name)
	return v.validateA2AServer(a2aServer)
}

// ValidateDelete implements webhook.Validator so a webhook will be registered for the type
func (v *A2AServerValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	a2aServer, ok := obj.(*arkv1prealpha1.A2AServer)
	if !ok {
		return nil, fmt.Errorf("expected A2AServer, got %T", obj)
	}

	a2aserverlog.Info("validate delete", "name", a2aServer.Name)
	return nil, nil
}

func (v *A2AServerValidator) validateA2AServer(a2aServer *arkv1prealpha1.A2AServer) (admission.Warnings, error) {
	var allErrs []error

	// Validate address ValueSource
	if err := v.validateAddress(a2aServer.Spec.Address); err != nil {
		allErrs = append(allErrs, err)
	}

	// Validate headers
	if err := v.validateHeaders(a2aServer.Spec.Headers); err != nil {
		allErrs = append(allErrs, err)
	}

	if a2aServer.Spec.PollInterval != nil {
		if err := validationv1.ValidatePollInterval(a2aServer.Spec.PollInterval.Duration); err != nil {
			allErrs = append(allErrs, err)
		}
	}

	if len(allErrs) > 0 {
		return nil, fmt.Errorf("validation failed: %v", allErrs)
	}

	return nil, nil
}

func (v *A2AServerValidator) validateAddress(address arkv1prealpha1.ValueSource) error {
	// Either value or valueFrom must be specified
	if address.Value == "" && address.ValueFrom == nil {
		return fmt.Errorf("address must specify either value or valueFrom")
	}

	// Both value and valueFrom cannot be specified
	if address.Value != "" && address.ValueFrom != nil {
		return fmt.Errorf("address cannot specify both value and valueFrom")
	}

	return nil
}

func (v *A2AServerValidator) validateHeaders(headers []arkv1prealpha1.Header) error {
	headerNames := make(map[string]bool)

	for _, header := range headers {
		// Check for duplicate header names
		if headerNames[header.Name] {
			return fmt.Errorf("duplicate header name: %s", header.Name)
		}
		headerNames[header.Name] = true

		// Validate header value
		if header.Value.Value == "" && header.Value.ValueFrom == nil {
			return fmt.Errorf("header %s must specify either value or valueFrom", header.Name)
		}

		if header.Value.Value != "" && header.Value.ValueFrom != nil {
			return fmt.Errorf("header %s cannot specify both value and valueFrom", header.Name)
		}
	}

	return nil
}
