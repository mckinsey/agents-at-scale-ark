package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func ValidateArkConfig(_ context.Context, cfg *arkv1alpha1.ArkConfig) ([]string, error) {
	var warnings []string
	if cfg.Name != ArkConfigSingletonName {
		warnings = append(warnings, fmt.Sprintf(
			"ArkConfig %q will be ignored — only the singleton named %q is consulted by admission webhooks",
			cfg.Name, ArkConfigSingletonName,
		))
	}
	if cfg.Spec.QueryTTL != nil && cfg.Spec.QueryTTL.Duration <= 0 {
		return warnings, fmt.Errorf("spec.queryTTL must be a positive duration, got %v", cfg.Spec.QueryTTL.Duration)
	}
	if cfg.Spec.EvaluationTTL != nil && cfg.Spec.EvaluationTTL.Duration <= 0 {
		return warnings, fmt.Errorf("spec.evaluationTTL must be a positive duration, got %v", cfg.Spec.EvaluationTTL.Duration)
	}
	return warnings, nil
}
