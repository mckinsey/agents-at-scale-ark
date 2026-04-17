package validation

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(s); err != nil {
		t.Fatalf("AddToScheme: %v", err)
	}
	return s
}

type fakeLookup struct{ c client.Client }

func (f *fakeLookup) GetArkConfig(ctx context.Context) (*arkv1alpha1.ArkConfig, error) {
	cfg := &arkv1alpha1.ArkConfig{}
	if err := f.c.Get(ctx, types.NamespacedName{Name: ArkConfigSingletonName}, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func TestResolveQueryTTL_FallbackWhenArkConfigMissing(t *testing.T) {
	c := fake.NewClientBuilder().WithScheme(newScheme(t)).Build()
	got := ResolveQueryTTL(context.Background(), &fakeLookup{c: c})
	if got.Duration != DefaultTTLFallback {
		t.Fatalf("want %v, got %v", DefaultTTLFallback, got.Duration)
	}
}

func TestResolveQueryTTL_UsesArkConfigValue(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			QueryTTL: &metav1.Duration{Duration: 2 * time.Hour},
		},
	}
	c := fake.NewClientBuilder().WithScheme(newScheme(t)).WithObjects(cfg).Build()
	got := ResolveQueryTTL(context.Background(), &fakeLookup{c: c})
	if got.Duration != 2*time.Hour {
		t.Fatalf("want 2h, got %v", got.Duration)
	}
}

func TestResolveEvalTTL_UsesArkConfigValue(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			EvaluationTTL: &metav1.Duration{Duration: 48 * time.Hour},
		},
	}
	c := fake.NewClientBuilder().WithScheme(newScheme(t)).WithObjects(cfg).Build()
	got := ResolveEvalTTL(context.Background(), &fakeLookup{c: c})
	if got.Duration != 48*time.Hour {
		t.Fatalf("want 48h, got %v", got.Duration)
	}
}

func TestResolveEvalTTL_FallbackWhenLookupNil(t *testing.T) {
	got := ResolveEvalTTL(context.Background(), nil)
	if got.Duration != DefaultTTLFallback {
		t.Fatalf("want %v, got %v", DefaultTTLFallback, got.Duration)
	}
}
