package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func ValidateArkConfig(_ context.Context, cfg *arkv1alpha1.ArkConfig) ([]string, error) {
	if cfg.Name != ArkConfigSingletonName {
		return nil, fmt.Errorf(
			"ArkConfig must be named %q; %q would be ignored as only the singleton is consulted by admission webhooks",
			ArkConfigSingletonName, cfg.Name,
		)
	}
	if cfg.Spec.QueryTTL != nil && cfg.Spec.QueryTTL.Duration <= 0 {
		return nil, fmt.Errorf("spec.queryTTL must be a positive duration, got %v", cfg.Spec.QueryTTL.Duration)
	}
	return nil, nil
}
