package validation

import (
	"fmt"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
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

	if len(allErrs) > 0 {
		return nil, fmt.Errorf("validation failed: %v", allErrs)
	}

	return nil, nil
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
