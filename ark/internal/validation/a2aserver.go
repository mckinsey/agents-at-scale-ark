package validation

import (
	"fmt"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

func ValidateA2AServer(a2aserver *arkv1prealpha1.A2AServer) ([]string, error) {
	var allErrs []error

	if err := validateA2AAddress(a2aserver.Spec.Address); err != nil {
		allErrs = append(allErrs, err)
	}

	if err := validateA2AHeaders(a2aserver.Spec.Headers); err != nil {
		allErrs = append(allErrs, err)
	}

	if a2aserver.Spec.PollInterval != nil {
		if err := ValidatePollInterval(a2aserver.Spec.PollInterval.Duration); err != nil {
			allErrs = append(allErrs, err)
		}
	}

	for i, host := range a2aserver.Spec.AllowedEndpointHosts {
		if err := arka2a.ValidateAllowedEndpointHost(host); err != nil {
			allErrs = append(allErrs, fmt.Errorf("allowedEndpointHosts[%d]: %w", i, err))
		}
	}

	if len(allErrs) > 0 {
		return nil, fmt.Errorf("validation failed: %v", allErrs)
	}

	return endpointResolutionWarnings(a2aserver.Spec), nil
}

func endpointResolutionWarnings(spec arkv1prealpha1.A2AServerSpec) []string {
	usesAllowlist := spec.EndpointResolution == arka2a.EndpointResolutionCardURL
	switch {
	case len(spec.AllowedEndpointHosts) > 0 && !usesAllowlist:
		return []string{fmt.Sprintf("spec.allowedEndpointHosts is ignored unless spec.endpointResolution is %q", arka2a.EndpointResolutionCardURL)}
	case usesAllowlist && len(spec.AllowedEndpointHosts) == 0:
		return []string{"spec.endpointResolution is \"cardUrl\" with no spec.allowedEndpointHosts, only agent card URLs on the origin of spec.address will be accepted"}
	}
	return nil
}

func validateA2AAddress(address arkv1prealpha1.ValueSource) error {
	if address.Value == "" && address.ValueFrom == nil {
		return fmt.Errorf("address must specify either value or valueFrom")
	}
	if address.Value != "" && address.ValueFrom != nil {
		return fmt.Errorf("address cannot specify both value and valueFrom")
	}
	return nil
}

func validateA2AHeaders(headers []arkv1prealpha1.Header) error {
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
