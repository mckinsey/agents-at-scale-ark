package validation

import (
	"context"
	"fmt"
	"strings"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkmcp "mckinsey.com/ark/internal/mcp"
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

	if err := validateClientCredentials(mcpserver.Spec.Authorization); err != nil {
		return nil, err
	}

	return nil, nil
}

// validateClientCredentials checks machine-to-machine acquisition
// config. The CRD schema already enforces required fields and the
// algorithm enum; this covers what OpenAPI validation cannot express —
// present-but-blank strings, and override URLs that the discovery layer
// would later reject.
func validateClientCredentials(auth *arkv1alpha1.MCPServerAuthorizationSpec) error {
	if auth == nil || auth.ClientCredentials == nil {
		return nil
	}
	cc := auth.ClientCredentials

	if strings.TrimSpace(cc.ClientID) == "" {
		return fmt.Errorf("authorization.clientCredentials.clientID must not be empty")
	}
	// The CRD's CEL rule enforces exactly-one-of; this covers the member
	// being present but blank, which OpenAPI cannot express.
	pkjwt := cc.ClientAuthentication.PrivateKeyJWT
	if pkjwt == nil {
		return fmt.Errorf("authorization.clientCredentials.clientAuthentication must set exactly one method")
	}
	if strings.TrimSpace(pkjwt.SecretKeyRef.Name) == "" {
		return fmt.Errorf("authorization.clientCredentials.clientAuthentication.privateKeyJWT.secretKeyRef.name must not be empty")
	}

	overrides := []struct {
		field string
		value string
	}{
		{"tokenEndpoint", cc.TokenEndpoint},
		{"resource", cc.Resource},
	}
	// Same check the mint path applies before putting the assertion on
	// the wire (arkmcp.ValidateEndpointURL). Shared rather than
	// reimplemented so admission cannot come to disagree with the
	// behaviour it is meant to predict.
	for _, o := range overrides {
		if o.value == "" {
			continue
		}
		if err := arkmcp.ValidateEndpointURL("authorization.clientCredentials."+o.field, o.value); err != nil {
			return err
		}
	}

	return nil
}
