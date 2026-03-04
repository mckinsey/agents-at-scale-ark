//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateQuery(t *testing.T) {
	lookup := newMockLookup()
	lookup.addResource("Agent", "default", "my-agent", &arkv1alpha1.Agent{})
	lookup.addResource("Team", "default", "my-team", &arkv1alpha1.Team{})
	lookup.addResource("Model", "default", "my-model", &arkv1alpha1.Model{})
	lookup.addResource("Tool", "default", "my-tool", &arkv1alpha1.Tool{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("rejects query without target or selector", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("skips deleted query", func(t *testing.T) {
		now := metav1.Now()
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:              "q",
				Namespace:         "default",
				DeletionTimestamp: &now,
			},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	for _, targetType := range []string{"agent", "team", "model", "tool"} {
		t.Run("valid query targeting "+targetType, func(t *testing.T) {
			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{Type: targetType, Name: "my-" + targetType},
				},
			}
			_, err := v.ValidateQuery(ctx, query)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}

	t.Run("rejects unsupported target type", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "invalid", Name: "x"},
			},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err == nil {
			t.Fatal("expected error for unsupported target type")
		}
	})

	t.Run("rejects nonexistent target", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "nonexistent"},
			},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err == nil {
			t.Fatal("expected error for nonexistent target")
		}
	})

	t.Run("validates query with selector only", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector: &metav1.LabelSelector{},
			},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("validates query parameters", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector:   &metav1.LabelSelector{},
				Parameters: []arkv1alpha1.Parameter{{Name: ""}},
			},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err == nil {
			t.Fatal("expected error for invalid parameter")
		}
	})

	t.Run("validates query overrides", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Selector:  &metav1.LabelSelector{},
				Overrides: []arkv1alpha1.Override{{ResourceType: "invalid"}},
			},
		}
		_, err := v.ValidateQuery(ctx, query)
		if err == nil {
			t.Fatal("expected error for invalid override")
		}
	})
}
