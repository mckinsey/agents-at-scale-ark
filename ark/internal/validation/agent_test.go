//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func TestValidateAgent(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid agent", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects invalid parameter", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Parameters: []arkv1alpha1.Parameter{{Name: ""}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil {
			t.Fatal("expected error for empty parameter name")
		}
	})

	t.Run("rejects invalid override resourceType", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Overrides: []arkv1alpha1.Override{{ResourceType: "invalid"}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil {
			t.Fatal("expected error for invalid override")
		}
	})

	t.Run("rejects agent tool with unsupported type", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "unknown", Name: "t"}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil {
			t.Fatal("expected error for unsupported tool type")
		}
	})

	t.Run("rejects built-in tool without name", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "built-in"}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil {
			t.Fatal("expected error for built-in tool without name")
		}
	})

	t.Run("rejects invalid built-in tool name", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "built-in", Name: "invalid"}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil {
			t.Fatal("expected error for invalid built-in tool name")
		}
	})

	t.Run("accepts valid built-in tool", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "built-in", Name: "noop"}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects mcp tool without name", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "mcp"}},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil {
			t.Fatal("expected error for mcp tool without name")
		}
	})

	t.Run("collects migration warnings", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "a",
				Namespace: "default",
				Annotations: map[string]string{
					annotations.MigrationWarningPrefix + "test": "warning message",
				},
			},
		}
		warnings, err := v.ValidateAgent(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(warnings) != 1 {
			t.Fatalf("expected 1 warning, got %d", len(warnings))
		}
	})
}
