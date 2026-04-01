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

//nolint:gocognit
func TestDefaultTeam(t *testing.T) {
	t.Run("migrates round-robin with maxTurns to sequential with loops", func(t *testing.T) {
		maxTurns := 5
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "round-robin",
				MaxTurns: &maxTurns,
			},
		}
		DefaultTeam(team)
		if team.Spec.Strategy != "sequential" {
			t.Fatalf("expected strategy 'sequential', got '%s'", team.Spec.Strategy)
		}
		if !team.Spec.Loops {
			t.Fatal("expected loops to be true")
		}
		if team.Spec.MaxTurns == nil || *team.Spec.MaxTurns != 5 {
			t.Fatal("expected maxTurns to be preserved")
		}
		key := annotations.MigrationWarningPrefix + "round-robin"
		if team.Annotations[key] == "" {
			t.Fatal("expected migration warning annotation")
		}
	})

	t.Run("migrates round-robin without maxTurns to plain sequential", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "round-robin",
			},
		}
		DefaultTeam(team)
		if team.Spec.Strategy != "sequential" {
			t.Fatalf("expected strategy 'sequential', got '%s'", team.Spec.Strategy)
		}
		if team.Spec.Loops {
			t.Fatal("expected loops to be false")
		}
		if team.Spec.MaxTurns != nil {
			t.Fatal("expected maxTurns to remain nil")
		}
		key := annotations.MigrationWarningPrefix + "round-robin"
		if team.Annotations[key] == "" {
			t.Fatal("expected migration warning annotation")
		}
	})

	t.Run("does not modify sequential strategy", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
			},
		}
		DefaultTeam(team)
		if team.Spec.Strategy != "sequential" {
			t.Fatalf("expected strategy 'sequential', got '%s'", team.Spec.Strategy)
		}
		if team.Annotations != nil {
			t.Fatal("expected no annotations")
		}
	})

	t.Run("does not modify graph strategy", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
			},
		}
		DefaultTeam(team)
		if team.Spec.Strategy != "graph" {
			t.Fatalf("expected strategy 'graph', got '%s'", team.Spec.Strategy)
		}
	})
}

func TestDefaultQuery(t *testing.T) {
	t.Run("migrates messages type to user with extracted text", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}
		_ = query.Spec.Input.UnmarshalJSON([]byte(`[{"role":"user","content":"hello world"}]`))
		DefaultQuery(query)
		text, _ := query.Spec.GetInputString()
		if text != "hello world" {
			t.Fatalf("expected 'hello world', got '%s'", text)
		}
		key := annotations.MigrationWarningPrefix + "input-type"
		if query.Annotations[key] == "" {
			t.Fatal("expected migration warning annotation")
		}
	})

	t.Run("sets empty text when extraction fails", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}
		_ = query.Spec.Input.UnmarshalJSON([]byte(`"not-an-array"`))
		DefaultQuery(query)
		text, _ := query.Spec.GetInputString()
		if text != "" {
			t.Fatalf("expected empty string, got '%s'", text)
		}
	})

	t.Run("does not modify non-messages type", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
			},
		}
		_ = query.Spec.Input.UnmarshalJSON([]byte(`"original"`))
		DefaultQuery(query)
		text, _ := query.Spec.GetInputString()
		if text != "original" {
			t.Fatalf("expected 'original', got '%s'", text)
		}
		if query.Annotations != nil {
			t.Fatal("expected no annotations for non-messages type")
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
