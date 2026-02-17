//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestWebhookValidatorDefaulter(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("ValidateCreate delegates to Validate", func(t *testing.T) {
		wv := &WebhookValidator{V: v}
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
		}
		_, err := wv.ValidateCreate(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("ValidateUpdate delegates to Validate with new obj", func(t *testing.T) {
		wv := &WebhookValidator{V: v}
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
		}
		_, err := wv.ValidateUpdate(ctx, agent, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("ValidateDelete returns nil", func(t *testing.T) {
		wv := &WebhookValidator{V: v}
		_, err := wv.ValidateDelete(ctx, &arkv1alpha1.Agent{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("Default applies defaults", func(t *testing.T) {
		d := &WebhookDefaulter{}
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		err := d.Default(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if agent.Spec.ModelRef == nil || agent.Spec.ModelRef.Name != "default" {
			t.Fatal("expected default modelRef")
		}
	})
}
