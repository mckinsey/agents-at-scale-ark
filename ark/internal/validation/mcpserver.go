package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func (v *Validator) ValidateMCPServer(ctx context.Context, mcpserver *arkv1alpha1.MCPServer) ([]string, error) {
	if _, err := v.ResolveValueSource(ctx, mcpserver.Spec.Address, mcpserver.GetNamespace()); err != nil {
		return nil, fmt.Errorf("failed to resolve Address: %w", err)
	}

	for i, header := range mcpserver.Spec.Headers {
		contextPrefix := fmt.Sprintf("headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return nil, err
		}
	}

	if mcpserver.Spec.PollInterval != nil {
		if err := ValidatePollInterval(mcpserver.Spec.PollInterval.Duration); err != nil {
			return nil, fmt.Errorf("failed to validate pollInterval: %w", err)
		}
	}

	return nil, nil
}
