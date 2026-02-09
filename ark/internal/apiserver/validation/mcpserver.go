package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type MCPServerValidator struct {
	*StorageValidator
}

func NewMCPServerValidator(sv *StorageValidator) *MCPServerValidator {
	return &MCPServerValidator{StorageValidator: sv}
}

func (v *MCPServerValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	mcpserver, ok := obj.(*arkv1alpha1.MCPServer)
	if !ok {
		return fmt.Errorf("expected a MCPServer object but got %T", obj)
	}
	return v.validateMCPServer(ctx, mcpserver)
}

func (v *MCPServerValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	mcpserver, ok := newObj.(*arkv1alpha1.MCPServer)
	if !ok {
		return fmt.Errorf("expected a MCPServer object but got %T", newObj)
	}
	return v.validateMCPServer(ctx, mcpserver)
}

func (v *MCPServerValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *MCPServerValidator) validateMCPServer(ctx context.Context, mcpserver *arkv1alpha1.MCPServer) error {
	if err := v.validateAddress(ctx, mcpserver); err != nil {
		return err
	}

	for i, header := range mcpserver.Spec.Headers {
		contextPrefix := fmt.Sprintf("headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	if err := ValidatePollInterval(mcpserver.Spec.PollInterval.Duration); err != nil {
		return fmt.Errorf("failed to validate pollInterval: %w", err)
	}

	return nil
}

func (v *MCPServerValidator) validateAddress(ctx context.Context, mcpserver *arkv1alpha1.MCPServer) error {
	return v.ValidateAddress(ctx, mcpserver.Spec.Address, mcpserver.Namespace)
}
