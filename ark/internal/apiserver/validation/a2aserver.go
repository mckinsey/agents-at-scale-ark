package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

type A2AServerValidator struct {
	*StorageValidator
}

func NewA2AServerValidator(sv *StorageValidator) *A2AServerValidator {
	return &A2AServerValidator{StorageValidator: sv}
}

func (v *A2AServerValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	a2aServer, ok := obj.(*arkv1prealpha1.A2AServer)
	if !ok {
		return fmt.Errorf("expected A2AServer, got %T", obj)
	}
	return v.validateA2AServer(a2aServer)
}

func (v *A2AServerValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	a2aServer, ok := newObj.(*arkv1prealpha1.A2AServer)
	if !ok {
		return fmt.Errorf("expected A2AServer, got %T", newObj)
	}
	return v.validateA2AServer(a2aServer)
}

func (v *A2AServerValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *A2AServerValidator) validateA2AServer(a2aServer *arkv1prealpha1.A2AServer) error {
	if err := v.validateAddress(a2aServer.Spec.Address); err != nil {
		return err
	}

	if err := v.validateHeaders(a2aServer.Spec.Headers); err != nil {
		return err
	}

	if a2aServer.Spec.PollInterval != nil {
		if err := ValidatePollInterval(a2aServer.Spec.PollInterval.Duration); err != nil {
			return err
		}
	}

	return nil
}

func (v *A2AServerValidator) validateAddress(address arkv1prealpha1.ValueSource) error {
	if address.Value == "" && address.ValueFrom == nil {
		return fmt.Errorf("address must specify either value or valueFrom")
	}

	if address.Value != "" && address.ValueFrom != nil {
		return fmt.Errorf("address cannot specify both value and valueFrom")
	}

	return nil
}

func (v *A2AServerValidator) validateHeaders(headers []arkv1prealpha1.Header) error {
	headerNames := make(map[string]bool)

	for _, header := range headers {
		if headerNames[header.Name] {
			return fmt.Errorf("duplicate header name: %s", header.Name)
		}
		headerNames[header.Name] = true

		if header.Value.Value == "" && header.Value.ValueFrom == nil {
			return fmt.Errorf("header %s must specify either value or valueFrom", header.Name)
		}

		if header.Value.Value != "" && header.Value.ValueFrom != nil {
			return fmt.Errorf("header %s cannot specify both value and valueFrom", header.Name)
		}
	}

	return nil
}
