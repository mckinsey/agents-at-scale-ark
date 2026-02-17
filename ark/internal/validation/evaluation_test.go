//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateEvaluation(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addResource("Evaluator", "default", "my-evaluator", &arkv1alpha1.Evaluator{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid direct evaluation", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "direct",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					DirectEvaluationConfig: arkv1alpha1.DirectEvaluationConfig{Input: "input", Output: "output"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects direct without input", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "direct",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					DirectEvaluationConfig: arkv1alpha1.DirectEvaluationConfig{Output: "output"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for direct without input")
		}
	})

	t.Run("rejects direct without output", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "direct",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					DirectEvaluationConfig: arkv1alpha1.DirectEvaluationConfig{Input: "input"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for direct without output")
		}
	})

	t.Run("rejects direct with queryRef", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "direct",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					DirectEvaluationConfig:     arkv1alpha1.DirectEvaluationConfig{Input: "input", Output: "output"},
					QueryBasedEvaluationConfig: arkv1alpha1.QueryBasedEvaluationConfig{QueryRef: &arkv1alpha1.QueryRef{Name: "q"}},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for direct with queryRef")
		}
	})

	t.Run("valid query evaluation", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "query",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					QueryBasedEvaluationConfig: arkv1alpha1.QueryBasedEvaluationConfig{QueryRef: &arkv1alpha1.QueryRef{Name: "q"}},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects query without queryRef", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "query",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for query without queryRef")
		}
	})

	t.Run("rejects query with input", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "query",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					QueryBasedEvaluationConfig: arkv1alpha1.QueryBasedEvaluationConfig{QueryRef: &arkv1alpha1.QueryRef{Name: "q"}},
					DirectEvaluationConfig:     arkv1alpha1.DirectEvaluationConfig{Input: "should not be set"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for query with input")
		}
	})

	t.Run("valid batch evaluation", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "batch",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					BatchEvaluationConfig: arkv1alpha1.BatchEvaluationConfig{
						Evaluations: []arkv1alpha1.EvaluationRef{{Name: "e1"}},
					},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects batch without evaluations", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "batch",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for batch without evaluations")
		}
	})

	t.Run("rejects batch with input", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "batch",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					BatchEvaluationConfig:  arkv1alpha1.BatchEvaluationConfig{Evaluations: []arkv1alpha1.EvaluationRef{{Name: "e1"}}},
					DirectEvaluationConfig: arkv1alpha1.DirectEvaluationConfig{Input: "should not"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects batch with output", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "batch",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					BatchEvaluationConfig:  arkv1alpha1.BatchEvaluationConfig{Evaluations: []arkv1alpha1.EvaluationRef{{Name: "e1"}}},
					DirectEvaluationConfig: arkv1alpha1.DirectEvaluationConfig{Output: "should not"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid baseline evaluation", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "baseline",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid event evaluation", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "event",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					EventEvaluationConfig: arkv1alpha1.EventEvaluationConfig{
						Rules: []arkv1alpha1.ExpressionRule{{Name: "r1"}},
					},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects event without rules", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "event",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for event without rules")
		}
	})

	t.Run("rejects unsupported evaluation type", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "invalid",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for unsupported type")
		}
	})

	t.Run("rejects evaluator parameter without name", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type: "baseline",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
					Name:       "my-evaluator",
					Parameters: []arkv1alpha1.Parameter{{Value: "v"}},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for parameter without name")
		}
	})

	t.Run("rejects evaluator parameter without value", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type: "baseline",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
					Name:       "my-evaluator",
					Parameters: []arkv1alpha1.Parameter{{Name: "n"}},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for parameter without value")
		}
	})

	t.Run("rejects nonexistent evaluator ref", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type:      "baseline",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "nonexistent"},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err == nil {
			t.Fatal("expected error for nonexistent evaluator")
		}
	})

	t.Run("uses evaluator namespace", func(t *testing.T) {
		lookup.addResource("Evaluator", "other-ns", "cross-ns-eval", &arkv1alpha1.Evaluator{})
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Type: "baseline",
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
					Name:      "cross-ns-eval",
					Namespace: "other-ns",
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("empty type defaults to direct", func(t *testing.T) {
		eval := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{Name: "e", Namespace: "default"},
			Spec: arkv1alpha1.EvaluationSpec{
				Evaluator: arkv1alpha1.EvaluationEvaluatorRef{Name: "my-evaluator"},
				Config: arkv1alpha1.EvaluationConfig{
					DirectEvaluationConfig: arkv1alpha1.DirectEvaluationConfig{Input: "input", Output: "output"},
				},
			},
		}
		_, err := v.ValidateEvaluation(ctx, eval)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
