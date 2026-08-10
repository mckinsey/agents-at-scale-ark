package validation

import (
	"context"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// ArkConfigSingletonName is the only ArkConfig object the mutating
// webhook will consult. Other names are ignored (with a warning from
// the ArkConfig validator).
const ArkConfigSingletonName = "default"

// DefaultTTLFallback is used when no ArkConfig/default exists or when
// the relevant field is unset. It matches the previous CRD-level default.
const DefaultTTLFallback = 720 * time.Hour

// ArkConfigLookup is implemented by anything capable of returning the
// ArkConfig singleton (production: WebhookLookup; tests: fakes).
type ArkConfigLookup interface {
	GetArkConfig(ctx context.Context) (*arkv1alpha1.ArkConfig, error)
}

func resolveTTL(
	ctx context.Context,
	lookup ArkConfigLookup,
	pick func(*arkv1alpha1.ArkConfigSpec) *metav1.Duration,
) metav1.Duration {
	fallback := metav1.Duration{Duration: DefaultTTLFallback}
	if lookup == nil {
		return fallback
	}
	cfg, err := lookup.GetArkConfig(ctx)
	if err != nil {
		return fallback
	}
	if v := pick(&cfg.Spec); v != nil {
		return *v
	}
	return fallback
}

// ResolveQueryTTL returns the TTL to inject into a Query that has no
// explicit spec.ttl.
func ResolveQueryTTL(ctx context.Context, lookup ArkConfigLookup) metav1.Duration {
	return resolveTTL(ctx, lookup, func(s *arkv1alpha1.ArkConfigSpec) *metav1.Duration {
		return s.QueryTTL
	})
}
