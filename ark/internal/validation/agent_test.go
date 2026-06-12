//nolint:goconst
package validation

import (
	"context"
	"testing"
	"time"

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

	t.Run("accepts tool with nil approval config", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "mcp", Name: "t"}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts tool with valid approval config", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type: "mcp",
					Name: "t",
					Approval: &arkv1alpha1.ToolApprovalConfig{
						Required:  true,
						Timeout:   &metav1.Duration{Duration: 5 * time.Minute},
						OnTimeout: "reject",
					},
				}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts tool with onTimeout=proceed", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type: "mcp",
					Name: "t",
					Approval: &arkv1alpha1.ToolApprovalConfig{
						Required:  true,
						OnTimeout: "proceed",
					},
				}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts tool with empty onTimeout (default reject)", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type: "mcp",
					Name: "t",
					Approval: &arkv1alpha1.ToolApprovalConfig{
						Required: true,
					},
				}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects zero approval timeout", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type: "mcp",
					Name: "t",
					Approval: &arkv1alpha1.ToolApprovalConfig{
						Required: true,
						Timeout:  &metav1.Duration{Duration: 0},
					},
				}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err == nil {
			t.Fatal("expected error for zero approval timeout")
		}
	})

	t.Run("rejects negative approval timeout", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type: "mcp",
					Name: "t",
					Approval: &arkv1alpha1.ToolApprovalConfig{
						Required: true,
						Timeout:  &metav1.Duration{Duration: -1 * time.Second},
					},
				}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err == nil {
			t.Fatal("expected error for negative approval timeout")
		}
	})

	t.Run("rejects invalid onTimeout value", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type: "mcp",
					Name: "t",
					Approval: &arkv1alpha1.ToolApprovalConfig{
						Required:  true,
						OnTimeout: "bogus",
					},
				}},
			},
		}
		if _, err := v.ValidateAgent(ctx, agent); err == nil {
			t.Fatal("expected error for invalid onTimeout value")
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
