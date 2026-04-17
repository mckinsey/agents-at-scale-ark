package v1

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

type fakeEvalLookup struct{ c client.Client }

func (f *fakeEvalLookup) GetArkConfig(ctx context.Context) (*arkv1alpha1.ArkConfig, error) {
	cfg := &arkv1alpha1.ArkConfig{}
	if err := f.c.Get(ctx, client.ObjectKey{Name: validation.ArkConfigSingletonName}, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func evaluationSchemeForTest(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(s); err != nil {
		t.Fatalf("AddToScheme: %v", err)
	}
	return s
}

func newEvaluation() *unstructured.Unstructured {
	u := &unstructured.Unstructured{}
	u.SetAPIVersion("ark.mckinsey.com/v1alpha1")
	u.SetKind("Evaluation")
	u.SetName("demo")
	return u
}

func TestEvaluationDefaulter_InjectsTTLWhenMissing(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: validation.ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			EvaluationTTL: &metav1.Duration{Duration: 3 * time.Hour},
		},
	}
	c := fake.NewClientBuilder().WithScheme(evaluationSchemeForTest(t)).WithObjects(cfg).Build()

	d := &EvaluationDefaulter{Lookup: &fakeEvalLookup{c: c}}
	obj := newEvaluation()

	if err := d.Default(context.Background(), obj); err != nil {
		t.Fatalf("Default returned error: %v", err)
	}
	ttl, found, err := unstructured.NestedString(obj.Object, "spec", "ttl")
	if err != nil || !found {
		t.Fatalf("ttl missing after defaulting: err=%v found=%v", err, found)
	}
	if ttl != "3h0m0s" {
		t.Fatalf("want 3h0m0s, got %q", ttl)
	}
}

func TestEvaluationDefaulter_LeavesExplicitTTLAlone(t *testing.T) {
	cfg := &arkv1alpha1.ArkConfig{
		ObjectMeta: metav1.ObjectMeta{Name: validation.ArkConfigSingletonName},
		Spec: arkv1alpha1.ArkConfigSpec{
			EvaluationTTL: &metav1.Duration{Duration: 3 * time.Hour},
		},
	}
	c := fake.NewClientBuilder().WithScheme(evaluationSchemeForTest(t)).WithObjects(cfg).Build()

	d := &EvaluationDefaulter{Lookup: &fakeEvalLookup{c: c}}
	obj := newEvaluation()
	if err := unstructured.SetNestedField(obj.Object, "30m", "spec", "ttl"); err != nil {
		t.Fatal(err)
	}

	if err := d.Default(context.Background(), obj); err != nil {
		t.Fatalf("Default returned error: %v", err)
	}
	ttl, _, _ := unstructured.NestedString(obj.Object, "spec", "ttl")
	if ttl != "30m" {
		t.Fatalf("explicit TTL clobbered: got %q", ttl)
	}
}

func TestEvaluationDefaulter_FallbackWhenLookupNil(t *testing.T) {
	d := &EvaluationDefaulter{Lookup: nil}
	obj := newEvaluation()

	if err := d.Default(context.Background(), obj); err != nil {
		t.Fatal(err)
	}
	ttl, _, _ := unstructured.NestedString(obj.Object, "spec", "ttl")
	if ttl != "720h0m0s" {
		t.Fatalf("want 720h0m0s fallback, got %q", ttl)
	}
}
