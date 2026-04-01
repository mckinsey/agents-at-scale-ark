//nolint:goconst
package validation

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestDispatchValidate(t *testing.T) {
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	lookup.addConfigMap("default", "cm1", map[string]string{"url": "https://api.openai.com"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("agent", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
		}
		_, err := v.Validate(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("model with valid openai config", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.openai.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "sk-test"},
					},
				},
			},
		}
		_, err := v.Validate(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("tool", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop", Namespace: "default"},
			Spec:       arkv1alpha1.ToolSpec{Type: ToolTypeBuiltin},
		}
		_, err := v.Validate(ctx, tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("query with target", func(t *testing.T) {
		lookup.addResource("Agent", "default", "qa", &arkv1alpha1.Agent{})
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "qa"},
			},
		}
		_, err := v.Validate(ctx, query)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("a2aserver", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := v.Validate(ctx, a2a)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("executionengine", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:9090"},
			},
		}
		_, err := v.Validate(ctx, ee)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("unknown type returns nil", func(t *testing.T) {
		_, err := v.Validate(ctx, &corev1.ConfigMap{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestDispatchApplyDefaults(t *testing.T) {
	t.Run("agent gets default model", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a"},
		}
		ApplyDefaults(agent)
		if agent.Spec.ModelRef == nil || agent.Spec.ModelRef.Name != "default" {
			t.Fatal("expected default modelRef")
		}
	})

	t.Run("model type migrated to provider", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			Spec: arkv1alpha1.ModelSpec{Type: ProviderAzure},
		}
		ApplyDefaults(model)
		if model.Spec.Provider != ProviderAzure {
			t.Fatalf("expected provider=%s, got %s", ProviderAzure, model.Spec.Provider)
		}
		if model.Spec.Type != ModelTypeCompletions {
			t.Fatalf("expected type=%s, got %s", ModelTypeCompletions, model.Spec.Type)
		}
	})

	t.Run("query messages type is migrated", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}
		_ = query.Spec.Input.UnmarshalJSON([]byte(`[{"role":"user","content":"hi"}]`))
		ApplyDefaults(query)
		text, _ := query.Spec.GetInputString()
		if text != "hi" {
			t.Fatalf("expected 'hi', got '%s'", text)
		}
	})

	t.Run("team round-robin is migrated", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "round-robin",
			},
		}
		ApplyDefaults(team)
		if team.Spec.Strategy != "sequential" {
			t.Fatalf("expected 'sequential', got '%s'", team.Spec.Strategy)
		}
	})

	t.Run("non-defaultable type is noop", func(t *testing.T) {
		ApplyDefaults(&corev1.ConfigMap{})
	})
}
