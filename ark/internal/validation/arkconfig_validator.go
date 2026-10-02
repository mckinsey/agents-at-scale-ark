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
	if mem := cfg.Spec.DefaultMemory; mem != nil {
		if mem.Name == "" {
			return nil, fmt.Errorf("spec.defaultMemory.name is required when spec.defaultMemory is set")
		}
		if mem.Namespace != "" {
			return nil, fmt.Errorf(
				"spec.defaultMemory.namespace must be empty, got %q; ArkConfig is cluster-scoped, so a fixed namespace would point every tenant at one memory backend and commingle their conversation history. The Memory is always resolved in the namespace of the Query being defaulted",
				mem.Namespace,
			)
		}
	}
	return nil, nil
}
