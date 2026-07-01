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

func TestDefaultQuery_InjectsTTLWhenMissing(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			QueryTTL: &metav1.Duration{Duration: time.Hour},
		},
	}
	c := fake.NewClientBuilder().WithScheme(newScheme(t)).WithObjects(cfg).Build()
	lookup := &fakeLookup{c: c}

	q := &arkv1alpha1.Query{}
	DefaultQuery(context.Background(), q, lookup)

	if q.Spec.TTL == nil {
		t.Fatalf("expected TTL to be injected")
	}
	if q.Spec.TTL.Duration != time.Hour {
		t.Fatalf("want 1h, got %v", q.Spec.TTL.Duration)
	}
}

func TestDefaultQuery_LeavesExplicitTTLAlone(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			QueryTTL: &metav1.Duration{Duration: time.Hour},
		},
	}
	c := fake.NewClientBuilder().WithScheme(newScheme(t)).WithObjects(cfg).Build()
	lookup := &fakeLookup{c: c}

	explicit := metav1.Duration{Duration: 5 * time.Minute}
	q := &arkv1alpha1.Query{}
	q.Spec.TTL = &explicit
	DefaultQuery(context.Background(), q, lookup)

	if q.Spec.TTL.Duration != 5*time.Minute {
		t.Fatalf("webhook clobbered explicit TTL: got %v", q.Spec.TTL.Duration)
	}
}

func TestDefaultQuery_FallbackWhenNoLookup(t *testing.T) {
	q := &arkv1alpha1.Query{}
	DefaultQuery(context.Background(), q, nil)
	if q.Spec.TTL == nil || q.Spec.TTL.Duration != DefaultTTLFallback {
		t.Fatalf("expected 720h fallback, got %v", q.Spec.TTL)
	}
}
