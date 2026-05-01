package validation

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateArkConfig_AcceptsDefault(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			QueryTTL: &metav1.Duration{Duration: time.Hour},
		},
	}
	warnings, err := ValidateArkConfig(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("unexpected warnings: %v", warnings)
	}
}

func TestValidateArkConfig_RejectsNonDefaultName(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: "other"},
	}
	_, err := ValidateArkConfig(context.Background(), cfg)
	if err == nil {
		t.Fatalf("expected error for non-default name")
	}
}

func TestValidateArkConfig_RejectsNegativeQueryTTL(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			QueryTTL: &metav1.Duration{Duration: -time.Hour},
		},
	}
	_, err := ValidateArkConfig(context.Background(), cfg)
	if err == nil {
		t.Fatalf("expected error for negative QueryTTL")
	}
}

