//nolint:goconst
package validation

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func TestDefaultAgent(t *testing.T) {
	t.Run("sets default modelRef", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		DefaultAgent(agent)
		if agent.Spec.ModelRef == nil || agent.Spec.ModelRef.Name != "default" {
			t.Fatal("expected default modelRef")
		}
	})

	t.Run("preserves existing modelRef", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			Spec: arkv1alpha1.AgentSpec{
				ModelRef: &arkv1alpha1.AgentModelRef{Name: "custom"},
			},
		}
		DefaultAgent(agent)
		if agent.Spec.ModelRef.Name != "custom" {
			t.Fatal("should preserve existing modelRef")
		}
	})

	t.Run("skips default for a2a agent", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Annotations: map[string]string{annotations.A2AServerName: "srv"},
			},
		}
		DefaultAgent(agent)
		if agent.Spec.ModelRef != nil {
			t.Fatal("a2a agent should not get default modelRef")
		}
	})

	t.Run("adds custom tool deprecation warning", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "test-agent"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "custom", Name: "my-tool"}},
			},
		}
		DefaultAgent(agent)
		key := annotations.MigrationWarningPrefix + "tool-type-custom"
		if agent.Annotations[key] == "" {
			t.Fatal("expected migration warning for custom tool type")
		}
	})

	t.Run("no warning for non-custom tool types", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a"},
			Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "mcp", Name: "t"}},
			},
		}
		DefaultAgent(agent)
		key := annotations.MigrationWarningPrefix + "tool-type-custom"
		if _, ok := agent.Annotations[key]; ok {
			t.Fatal("should not add warning for non-custom tools")
		}
	})
}

func TestDefaultModel(t *testing.T) {
	t.Run("migrates deprecated type to provider", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			Spec: arkv1alpha1.ModelSpec{Type: ProviderOpenAI},
		}
		DefaultModel(model)
		if model.Spec.Provider != ProviderOpenAI {
			t.Fatal("expected provider to be set")
		}
		if model.Spec.Type != ModelTypeCompletions {
			t.Fatal("expected type to be reset to completions")
		}
		if model.Annotations[annotations.MigrationWarningPrefix+"provider"] == "" {
			t.Fatal("expected migration warning annotation")
		}
	})

	t.Run("does not migrate when provider is set", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			Spec: arkv1alpha1.ModelSpec{
				Provider: ProviderAzure,
				Type:     ModelTypeCompletions,
			},
		}
		DefaultModel(model)
		if model.Spec.Provider != ProviderAzure {
			t.Fatal("should not change provider")
		}
	})

	t.Run("does not migrate non-provider type", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			Spec: arkv1alpha1.ModelSpec{Type: "custom-type"},
		}
		DefaultModel(model)
		if model.Spec.Provider != "" {
			t.Fatal("should not set provider for non-provider type")
		}
	})
}
