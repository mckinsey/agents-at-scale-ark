//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateEvaluator(t *testing.T) {
	lookup := newMockLookup()
	lookup.addResource("Model", "default", "my-model", &arkv1alpha1.Model{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid evaluator", func(t *testing.T) {
		evaluator := &arkv1alpha1.Evaluator{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluatorSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := v.ValidateEvaluator(ctx, evaluator)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("validates model reference from parameters", func(t *testing.T) {
		evaluator := &arkv1alpha1.Evaluator{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluatorSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Parameters: []arkv1alpha1.Parameter{
					{Name: "model.name", Value: "my-model"},
				},
			},
		}
		_, err := v.ValidateEvaluator(ctx, evaluator)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects nonexistent model reference", func(t *testing.T) {
		evaluator := &arkv1alpha1.Evaluator{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluatorSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Parameters: []arkv1alpha1.Parameter{
					{Name: "model.name", Value: "nonexistent"},
				},
			},
		}
		_, err := v.ValidateEvaluator(ctx, evaluator)
		if err == nil {
			t.Fatal("expected error for nonexistent model")
		}
	})

	t.Run("uses custom model namespace", func(t *testing.T) {
		lookup.addResource("Model", "other-ns", "ns-model", &arkv1alpha1.Model{})
		evaluator := &arkv1alpha1.Evaluator{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluatorSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Parameters: []arkv1alpha1.Parameter{
					{Name: "model.name", Value: "ns-model"},
					{Name: "model.namespace", Value: "other-ns"},
				},
			},
		}
		_, err := v.ValidateEvaluator(ctx, evaluator)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
