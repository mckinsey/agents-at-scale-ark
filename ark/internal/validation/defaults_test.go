//nolint:goconst
package validation

import (
	"context"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/labels"
)

//nolint:gocognit
func TestDefaultAgentModelRef(t *testing.T) {
	t.Run("sets default modelRef", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		DefaultAgent(agent)
		if agent.Spec.ModelRef == nil || agent.Spec.ModelRef.Name != "default" {
			t.Fatal("expected default modelRef")
		}
	})

	t.Run("marks an injected modelRef as defaulted", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		DefaultAgent(agent)
		if !HasDefaultedModelRef(agent) {
			t.Fatal("expected the injected modelRef to be marked as defaulted")
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
		if HasDefaultedModelRef(agent) {
			t.Fatal("an explicit modelRef should not be marked as defaulted")
		}
	})

	t.Run("does not mark an explicit default modelRef as defaulted", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			Spec: arkv1alpha1.AgentSpec{
				ModelRef: &arkv1alpha1.AgentModelRef{Name: "default"},
			},
		}
		DefaultAgent(agent)
		if HasDefaultedModelRef(agent) {
			t.Fatal("a user-supplied 'default' modelRef should not be marked as defaulted")
		}
	})

	t.Run("clears the marker when an explicit modelRef replaces the injected one", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		DefaultAgent(agent)

		agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "custom"}
		DefaultAgent(agent)

		if agent.Spec.ModelRef.Name != "custom" {
			t.Fatal("should preserve the explicit modelRef")
		}
		if HasDefaultedModelRef(agent) {
			t.Fatal("expected the defaulted marker to be cleared")
		}
	})

	t.Run("skips default for execution engine agent", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a"},
			Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "engine"},
			},
		}
		DefaultAgent(agent)
		if agent.Spec.ModelRef != nil {
			t.Fatal("execution engine agent should not get default modelRef")
		}
	})

	t.Run("removes the injected modelRef when an execution engine is added", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		DefaultAgent(agent)

		agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{Name: "engine"}
		DefaultAgent(agent)

		if agent.Spec.ModelRef != nil {
			t.Fatal("expected the injected modelRef to be removed")
		}
		if HasDefaultedModelRef(agent) {
			t.Fatal("expected the defaulted marker to be cleared")
		}
	})

	t.Run("keeps an explicit modelRef set together with an execution engine", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "a"}}
		DefaultAgent(agent)

		agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{Name: "engine"}
		agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "custom"}
		DefaultAgent(agent)

		if agent.Spec.ModelRef == nil || agent.Spec.ModelRef.Name != "custom" {
			t.Fatal("should preserve the explicit modelRef")
		}
		if HasDefaultedModelRef(agent) {
			t.Fatal("expected the defaulted marker to be cleared")
		}
	})

	t.Run("keeps an explicit modelRef on an execution engine agent", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a"},
			Spec: arkv1alpha1.AgentSpec{
				ModelRef:        &arkv1alpha1.AgentModelRef{Name: "custom"},
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "engine"},
			},
		}
		DefaultAgent(agent)
		if agent.Spec.ModelRef == nil || agent.Spec.ModelRef.Name != "custom" {
			t.Fatal("should preserve an explicit modelRef")
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
}

func TestDefaultAgent(t *testing.T) {
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
		if team.Spec.Loops == nil || !*team.Spec.Loops {
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
		if team.Spec.Loops == nil || *team.Spec.Loops {
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

	t.Run("adds migration warning for selector with custom prompt missing select-next-speaker", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: StrategySelector,
				Selector: &arkv1alpha1.TeamSelectorSpec{
					SelectorPrompt: "Pick the best agent for the task.",
				},
			},
		}
		DefaultTeam(team)
		key := annotations.MigrationWarningPrefix + "selector-prompt"
		if team.Annotations[key] == "" {
			t.Fatal("expected migration warning for selector prompt without select-next-speaker")
		}
	})

	t.Run("migrates graph to sequential with loops disabled", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				MaxTurns: &maxTurns,
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "a", To: "b"},
					},
				},
			},
		}
		DefaultTeam(team)
		if team.Spec.Strategy != "sequential" {
			t.Fatalf("expected strategy 'sequential', got '%s'", team.Spec.Strategy)
		}
		if team.Spec.Loops == nil || *team.Spec.Loops {
			t.Fatal("expected loops to be false")
		}
		if team.Spec.Graph != nil {
			t.Fatal("expected graph to be nil")
		}
		if team.Spec.MaxTurns != nil {
			t.Fatal("expected maxTurns to be nil")
		}
		key := annotations.MigrationWarningPrefix + "graph"
		if team.Annotations[key] == "" {
			t.Fatal("expected migration warning annotation")
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
		DefaultQuery(context.Background(), query, nil)
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
		DefaultQuery(context.Background(), query, nil)
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
		DefaultQuery(context.Background(), query, nil)
		text, _ := query.Spec.GetInputString()
		if text != "original" {
			t.Fatalf("expected 'original', got '%s'", text)
		}
		if _, ok := query.Annotations[annotations.MigrationWarningPrefix+"input-type"]; ok {
			t.Fatal("expected no migration warning annotation for non-messages type")
		}
		if query.Spec.TTL == nil {
			t.Fatal("expected TTL to be populated from fallback")
		}
	})
}

func TestDefaultMCPServer(t *testing.T) {
	newServer := func(name string, serverLabels map[string]string) *arkv1alpha1.MCPServer {
		return &arkv1alpha1.MCPServer{ObjectMeta: metav1.ObjectMeta{Name: name, Labels: serverLabels}}
	}

	t.Run("adds the name label", func(t *testing.T) {
		server := newServer("github", nil)
		DefaultMCPServer(server)
		if server.Labels[labels.NameLabel] != "github" {
			t.Fatalf("expected name label github, got %v", server.Labels)
		}
	})

	t.Run("replaces a name label copied from another server and keeps other labels", func(t *testing.T) {
		server := newServer("echo", map[string]string{labels.NameLabel: "github", "team": "a"})
		DefaultMCPServer(server)
		if server.Labels[labels.NameLabel] != "echo" || server.Labels["team"] != "a" {
			t.Fatalf("unexpected labels %v", server.Labels)
		}
	})

	t.Run("accepts a 63 character name", func(t *testing.T) {
		name := strings.Repeat("a", 63)
		server := newServer(name, nil)
		DefaultMCPServer(server)
		if server.Labels[labels.NameLabel] != name {
			t.Fatalf("expected the name label, got %v", server.Labels)
		}
	})

	t.Run("removes the name label when the name cannot be a label value", func(t *testing.T) {
		server := newServer(strings.Repeat("a", 64), map[string]string{labels.NameLabel: "github", "team": "a"})
		DefaultMCPServer(server)
		if _, ok := server.Labels[labels.NameLabel]; ok {
			t.Fatalf("expected no name label, got %v", server.Labels)
		}
		if server.Labels["team"] != "a" {
			t.Fatalf("expected other labels kept, got %v", server.Labels)
		}
	})

	t.Run("leaves a server without a name alone", func(t *testing.T) {
		server := newServer("", nil)
		DefaultMCPServer(server)
		if server.Labels != nil {
			t.Fatalf("expected no labels, got %v", server.Labels)
		}
	})

	t.Run("is applied through ApplyDefaults", func(t *testing.T) {
		server := newServer("github", nil)
		ApplyDefaults(context.Background(), server, nil)
		if server.Labels[labels.NameLabel] != "github" {
			t.Fatalf("expected name label from ApplyDefaults, got %v", server.Labels)
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

	bedrockAuthWarning := annotations.MigrationWarningPrefix + "bedrock-auth"

	newBedrockModel := func(bedrock *arkv1alpha1.BedrockModelConfig) *arkv1alpha1.Model {
		return &arkv1alpha1.Model{
			Spec: arkv1alpha1.ModelSpec{
				Provider: ProviderBedrock,
				Type:     ModelTypeCompletions,
				Config:   arkv1alpha1.ModelConfig{Bedrock: bedrock},
			},
		}
	}

	t.Run("warns when both apiKey and IAM credentials are set", func(t *testing.T) {
		model := newBedrockModel(&arkv1alpha1.BedrockModelConfig{
			APIKey:          &arkv1alpha1.ValueSource{Value: "key"},
			AccessKeyID:     &arkv1alpha1.ValueSource{Value: "id"},
			SecretAccessKey: &arkv1alpha1.ValueSource{Value: "secret"},
		})
		DefaultModel(model)
		if model.Annotations[bedrockAuthWarning] == "" {
			t.Fatal("expected bedrock-auth warning annotation")
		}
	})

	t.Run("no warning when only apiKey is set", func(t *testing.T) {
		model := newBedrockModel(&arkv1alpha1.BedrockModelConfig{
			APIKey: &arkv1alpha1.ValueSource{Value: "key"},
		})
		DefaultModel(model)
		if _, ok := model.Annotations[bedrockAuthWarning]; ok {
			t.Fatal("did not expect bedrock-auth warning when only apiKey is set")
		}
	})

	t.Run("no warning when only IAM credentials are set", func(t *testing.T) {
		model := newBedrockModel(&arkv1alpha1.BedrockModelConfig{
			AccessKeyID:     &arkv1alpha1.ValueSource{Value: "id"},
			SecretAccessKey: &arkv1alpha1.ValueSource{Value: "secret"},
		})
		DefaultModel(model)
		if _, ok := model.Annotations[bedrockAuthWarning]; ok {
			t.Fatal("did not expect bedrock-auth warning when only IAM credentials are set")
		}
	})

	t.Run("no warning when neither auth method is set", func(t *testing.T) {
		model := newBedrockModel(&arkv1alpha1.BedrockModelConfig{
			Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
		})
		DefaultModel(model)
		if _, ok := model.Annotations[bedrockAuthWarning]; ok {
			t.Fatal("did not expect bedrock-auth warning when neither auth method is set")
		}
	})
}
