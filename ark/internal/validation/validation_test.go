//nolint:goconst,unparam
package validation

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/genai"
)

type mockLookup struct {
	resources  map[string]runtime.Object
	secrets    map[string]*corev1.Secret
	configMaps map[string]*corev1.ConfigMap
}

func newMockLookup() *mockLookup {
	return &mockLookup{
		resources:  make(map[string]runtime.Object),
		secrets:    make(map[string]*corev1.Secret),
		configMaps: make(map[string]*corev1.ConfigMap),
	}
}

func (m *mockLookup) key(namespace, name string) string {
	return namespace + "/" + name
}

func (m *mockLookup) GetResource(_ context.Context, kind, namespace, name string) (runtime.Object, error) {
	obj, ok := m.resources[kind+"/"+m.key(namespace, name)]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return obj, nil
}

func (m *mockLookup) GetSecret(_ context.Context, namespace, name string) (*corev1.Secret, error) {
	s, ok := m.secrets[m.key(namespace, name)]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return s, nil
}

func (m *mockLookup) GetConfigMap(_ context.Context, namespace, name string) (*corev1.ConfigMap, error) {
	cm, ok := m.configMaps[m.key(namespace, name)]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return cm, nil
}

func (m *mockLookup) addResource(kind, namespace, name string, obj runtime.Object) {
	m.resources[kind+"/"+m.key(namespace, name)] = obj
}

func (m *mockLookup) addSecret(namespace, name string, data map[string][]byte) {
	m.secrets[m.key(namespace, name)] = &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data:       data,
	}
}

func (m *mockLookup) addConfigMap(namespace, name string, data map[string]string) {
	m.configMaps[m.key(namespace, name)] = &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data:       data,
	}
}

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
				Provider: genai.ProviderOpenAI,
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
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
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
			Spec: arkv1alpha1.ModelSpec{Type: genai.ProviderAzure},
		}
		ApplyDefaults(model)
		if model.Spec.Provider != genai.ProviderAzure {
			t.Fatalf("expected provider=%s, got %s", genai.ProviderAzure, model.Spec.Provider)
		}
		if model.Spec.Type != genai.ModelTypeCompletions {
			t.Fatalf("expected type=%s, got %s", genai.ModelTypeCompletions, model.Spec.Type)
		}
	})

	t.Run("non-defaultable type is noop", func(t *testing.T) {
		ApplyDefaults(&corev1.ConfigMap{})
	})
}

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
			Spec: arkv1alpha1.ModelSpec{Type: genai.ProviderOpenAI},
		}
		DefaultModel(model)
		if model.Spec.Provider != genai.ProviderOpenAI {
			t.Fatal("expected provider to be set")
		}
		if model.Spec.Type != genai.ModelTypeCompletions {
			t.Fatal("expected type to be reset to completions")
		}
		if model.Annotations[annotations.MigrationWarningPrefix+"provider"] == "" {
			t.Fatal("expected migration warning annotation")
		}
	})

	t.Run("does not migrate when provider is set", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			Spec: arkv1alpha1.ModelSpec{
				Provider: genai.ProviderAzure,
				Type:     genai.ModelTypeCompletions,
			},
		}
		DefaultModel(model)
		if model.Spec.Provider != genai.ProviderAzure {
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

func TestValidateModel(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("rejects missing provider", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model: arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Type:  genai.ModelTypeCompletions,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for missing provider")
		}
	})

	t.Run("suggests migration for deprecated type", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model: arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Type:  genai.ProviderOpenAI,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error")
		}
		if err.Error() == "" {
			t.Fatal("expected error message")
		}
	})

	t.Run("rejects unsupported provider", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "model"},
				Provider: "unsupported",
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for unsupported provider")
		}
	})

	t.Run("rejects azure without config", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "model"},
				Provider: genai.ProviderAzure,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for azure without config")
		}
	})

	t.Run("rejects openai without config", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "model"},
				Provider: genai.ProviderOpenAI,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for openai without config")
		}
	})

	t.Run("rejects bedrock without config", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "model"},
				Provider: genai.ProviderBedrock,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for bedrock without config")
		}
	})

	t.Run("valid azure model", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://azure.openai.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid bedrock model", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "claude"},
				Provider: genai.ProviderBedrock,
				Config: arkv1alpha1.ModelConfig{
					Bedrock: &arkv1alpha1.BedrockModelConfig{
						Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("azure validates headers", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://azure.openai.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
						Headers: []arkv1alpha1.Header{{Name: "", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for header without name")
		}
	})

	t.Run("openai validates headers", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.openai.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
						Headers: []arkv1alpha1.Header{{Name: "", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for header without name")
		}
	})

	t.Run("collects migration warnings", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "m",
				Namespace: "default",
				Annotations: map[string]string{
					annotations.MigrationWarningPrefix + "provider": "migrated",
				},
			},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.openai.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		warnings, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(warnings) != 1 {
			t.Fatalf("expected 1 warning, got %d", len(warnings))
		}
	})
}

func TestValidateTool(t *testing.T) { //nolint:gocognit
	t.Run("valid http tool", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeHTTP,
				HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "POST"},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects http tool without spec", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{Type: genai.ToolTypeHTTP},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects http tool without url", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeHTTP,
				HTTP: &arkv1alpha1.HTTPSpec{},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for missing URL")
		}
	})

	t.Run("rejects invalid http method", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeHTTP,
				HTTP: &arkv1alpha1.HTTPSpec{URL: "https://example.com", Method: "INVALID"},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for invalid method")
		}
	})

	t.Run("valid mcp tool", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeMCP,
				MCP: &arkv1alpha1.MCPToolRef{
					MCPServerRef: arkv1alpha1.MCPServerRef{Name: "srv"},
					ToolName:     "tool1",
				},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects mcp tool without spec", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{Type: genai.ToolTypeMCP},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects mcp tool without server name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeMCP,
				MCP:  &arkv1alpha1.MCPToolRef{ToolName: "tool1"},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for missing server name")
		}
	})

	t.Run("rejects mcp tool without tool name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeMCP,
				MCP:  &arkv1alpha1.MCPToolRef{MCPServerRef: arkv1alpha1.MCPServerRef{Name: "srv"}},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for missing tool name")
		}
	})

	t.Run("valid agent tool ref", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type:  genai.ToolTypeAgent,
				Agent: &arkv1alpha1.AgentToolRef{Name: "my-agent"},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects agent tool without name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type:  genai.ToolTypeAgent,
				Agent: &arkv1alpha1.AgentToolRef{},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid team tool ref", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{Name: "my-team"},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects team tool without name", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{
				Type: genai.ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid builtin noop", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop"},
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid builtin terminate", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "terminate"},
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unsupported builtin", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "unknown-builtin"},
			Spec:       arkv1alpha1.ToolSpec{Type: genai.ToolTypeBuiltin},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for unsupported builtin")
		}
	})

	t.Run("rejects unsupported tool type", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			Spec: arkv1alpha1.ToolSpec{Type: "unknown"},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates input schema", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop"},
			Spec: arkv1alpha1.ToolSpec{
				Type:        genai.ToolTypeBuiltin,
				InputSchema: &runtime.RawExtension{Raw: json.RawMessage(`{"type": "invalid-type"}`)},
			},
		}
		_, err := ValidateTool(tool)
		if err == nil {
			t.Fatal("expected error for invalid schema type")
		}
	})

	t.Run("accepts valid input schema", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: "noop"},
			Spec: arkv1alpha1.ToolSpec{
				Type:        genai.ToolTypeBuiltin,
				InputSchema: &runtime.RawExtension{Raw: json.RawMessage(`{"type": "object", "properties": {"name": {"type": "string"}}}`)},
			},
		}
		_, err := ValidateTool(tool)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

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

func TestValidateTeam(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addResource("Agent", "default", "agent1", &arkv1alpha1.Agent{})
	lookup.addResource("Agent", "default", "agent2", &arkv1alpha1.Agent{})
	lookup.addResource("Agent", "default", "coordinator", &arkv1alpha1.Agent{})
	lookup.addResource("Team", "default", "sub-team", &arkv1alpha1.Team{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid sequential team", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid round-robin team", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "round-robin",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unsupported strategy", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec:       arkv1alpha1.TeamSpec{Strategy: "unknown"},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for unsupported strategy")
		}
	})

	t.Run("rejects self-referencing member", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "t", Type: "team"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for self-reference")
		}
	})

	t.Run("rejects invalid member type", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "invalid"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for invalid member type")
		}
	})

	t.Run("rejects nonexistent agent member", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "nonexistent", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for nonexistent member")
		}
	})

	t.Run("accepts team member type", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "sub-team", Type: "team"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("selector requires selector.agent", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for missing selector.agent")
		}
	})

	t.Run("valid selector team", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Selector: &arkv1alpha1.TeamSelectorSpec{Agent: "coordinator"},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("graph strategy requires graph config", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for missing graph config")
		}
	})

	t.Run("graph strategy requires at least one edge", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for empty edges")
		}
	})

	t.Run("graph rejects invalid from member", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{{From: "unknown", To: "agent1"}},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for invalid from member")
		}
	})

	t.Run("graph rejects invalid to member", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{{From: "agent1", To: "unknown"}},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for invalid to member")
		}
	})

	t.Run("graph rejects duplicate outgoing edges", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
						{From: "agent1", To: "agent2"},
					},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for duplicate outgoing edges")
		}
	})

	t.Run("graph requires maxTurns", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
					},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for missing maxTurns")
		}
	})

	t.Run("valid graph team", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
					},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestValidateMCPServer(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid mcpserver with direct address", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unresolvable address", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates headers", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1alpha1.Header{{Name: "", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error for header without name")
		}
	})

	t.Run("rejects negative poll interval", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:      arkv1alpha1.ValueSource{Value: "http://localhost"},
				PollInterval: &metav1.Duration{Duration: -1 * time.Second},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error for negative poll interval")
		}
	})
}

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

func TestValidateA2AServer(t *testing.T) {
	t.Run("valid a2aserver", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects empty address", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for empty address")
		}
	})

	t.Run("rejects both value and valueFrom", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{
					Value:     "http://localhost",
					ValueFrom: &arkv1prealpha1.ValueFromSource{},
				},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for both value and valueFrom")
		}
	})

	t.Run("rejects duplicate headers", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1prealpha1.Header{
					{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v1"}},
					{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v2"}},
				},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for duplicate headers")
		}
	})

	t.Run("rejects header without value", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1prealpha1.Header{
					{Name: "X-Key", Value: arkv1alpha1.HeaderValue{}},
				},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for header without value")
		}
	})

	t.Run("rejects negative poll interval", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address:      arkv1prealpha1.ValueSource{Value: "http://localhost"},
				PollInterval: &metav1.Duration{Duration: -1 * time.Second},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for negative poll interval")
		}
	})
}

func TestValidateExecutionEngine(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid execution engine", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:9090"},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects reserved a2a name", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: genai.ExecutionEngineA2A, Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:9090"},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err == nil {
			t.Fatal("expected error for reserved a2a name")
		}
	})

	t.Run("address with serviceRef", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{
					ValueFrom: &arkv1prealpha1.ValueFromSource{
						ServiceRef: &arkv1prealpha1.ServiceReference{
							Name: "executor-svc",
							Port: "8080",
							Path: "/execute",
						},
					},
				},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unresolvable address", func(t *testing.T) {
		ee := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "langchain", Namespace: "default"},
			Spec: arkv1prealpha1.ExecutionEngineSpec{
				Address: arkv1prealpha1.ValueSource{},
			},
		}
		_, err := v.ValidateExecutionEngine(ctx, ee)
		if err == nil {
			t.Fatal("expected error for unresolvable address")
		}
	})
}

func TestConvertV1PreAlpha1ValueSource(t *testing.T) {
	t.Run("converts direct value", func(t *testing.T) {
		vs := arkv1prealpha1.ValueSource{Value: "http://localhost"}
		out := convertV1PreAlpha1ValueSource(vs)
		if out.Value != "http://localhost" {
			t.Fatal("expected value to be preserved")
		}
	})

	t.Run("converts secretKeyRef", func(t *testing.T) {
		vs := arkv1prealpha1.ValueSource{
			ValueFrom: &arkv1prealpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s"},
					Key:                  "k",
				},
			},
		}
		out := convertV1PreAlpha1ValueSource(vs)
		if out.ValueFrom == nil || out.ValueFrom.SecretKeyRef == nil {
			t.Fatal("expected secretKeyRef to be converted")
		}
		if out.ValueFrom.SecretKeyRef.Name != "s" {
			t.Fatal("expected secret name preserved")
		}
	})

	t.Run("converts serviceRef", func(t *testing.T) {
		vs := arkv1prealpha1.ValueSource{
			ValueFrom: &arkv1prealpha1.ValueFromSource{
				ServiceRef: &arkv1prealpha1.ServiceReference{
					Name:      "svc",
					Namespace: "ns",
					Port:      "443",
					Path:      "/path",
				},
			},
		}
		out := convertV1PreAlpha1ValueSource(vs)
		if out.ValueFrom == nil || out.ValueFrom.ServiceRef == nil {
			t.Fatal("expected serviceRef to be converted")
		}
		if out.ValueFrom.ServiceRef.Name != "svc" || out.ValueFrom.ServiceRef.Port != "443" {
			t.Fatal("expected serviceRef fields preserved")
		}
	})
}

func TestCommonValidateParameters(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	lookup.addConfigMap("default", "cm1", map[string]string{"key": "val"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid parameter with value", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{Name: "p1", Value: "v1"}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects parameter without name", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{Value: "v"}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects parameter with both value and valueFrom", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name:      "p",
			Value:     "v",
			ValueFrom: &arkv1alpha1.ValueFromSource{},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects parameter with neither value nor valueFrom", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{Name: "p"}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid parameter with secretKeyRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s1"},
					Key:                  "key",
				},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid parameter with configMapKeyRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cm1"},
					Key:                  "key",
				},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid parameter with serviceRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{Name: "svc"},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects serviceRef without name", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error for serviceRef without name")
		}
	})

	t.Run("valid parameter with queryParameterRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				QueryParameterRef: &arkv1alpha1.QueryParameterReference{Name: "qp"},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects queryParameterRef without name", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				QueryParameterRef: &arkv1alpha1.QueryParameterReference{},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error for queryParameterRef without name")
		}
	})

	t.Run("rejects multiple valueFrom sources", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s1"},
					Key:                  "key",
				},
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cm1"},
					Key:                  "key",
				},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error for multiple valueFrom sources")
		}
	})
}

func TestCommonValidateOverrides(t *testing.T) {
	t.Run("valid override with model type", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{
			ResourceType: "model",
			Headers:      []arkv1alpha1.Header{{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
		}}
		err := ValidateOverrides(overrides)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid override with mcpserver type", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{
			ResourceType: "mcpserver",
			Headers:      []arkv1alpha1.Header{{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
		}}
		err := ValidateOverrides(overrides)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects invalid resourceType", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{ResourceType: "invalid"}}
		err := ValidateOverrides(overrides)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects empty headers", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{ResourceType: "model"}}
		err := ValidateOverrides(overrides)
		if err == nil {
			t.Fatal("expected error for empty headers")
		}
	})
}

func TestCommonValidateHeader(t *testing.T) {
	t.Run("valid header", func(t *testing.T) {
		h := arkv1alpha1.Header{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v"}}
		err := ValidateHeader(h, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects empty name", func(t *testing.T) {
		h := arkv1alpha1.Header{Value: arkv1alpha1.HeaderValue{Value: "v"}}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects empty value and valueFrom", func(t *testing.T) {
		h := arkv1alpha1.Header{Name: "X-Key", Value: arkv1alpha1.HeaderValue{}}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects both value and valueFrom", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				Value:     "v",
				ValueFrom: &arkv1alpha1.HeaderValueSource{},
			},
		}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects valueFrom without any ref", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{},
			},
		}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error for valueFrom without refs")
		}
	})

	t.Run("rejects valueFrom with both refs", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					SecretKeyRef:    &corev1.SecretKeySelector{},
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{},
				},
			},
		}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error for both refs")
		}
	})

	t.Run("valid header with secretKeyRef", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					SecretKeyRef: &corev1.SecretKeySelector{},
				},
			},
		}
		err := ValidateHeader(h, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCommonResolveValueSource(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("secret-val")})
	lookup.addConfigMap("default", "cm1", map[string]string{"key": "cm-val"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("resolves direct value", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{Value: "direct"}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "direct" {
			t.Fatalf("expected 'direct', got '%s'", val)
		}
	})

	t.Run("rejects empty source", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{}
		_, err := v.ResolveValueSource(ctx, vs, "default")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("resolves secretKeyRef", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s1"},
					Key:                  "key",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "secret-val" {
			t.Fatalf("expected 'secret-val', got '%s'", val)
		}
	})

	t.Run("resolves configMapKeyRef", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cm1"},
					Key:                  "key",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "cm-val" {
			t.Fatalf("expected 'cm-val', got '%s'", val)
		}
	})

	t.Run("resolves serviceRef", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{
					Name: "svc",
					Port: "8080",
					Path: "/api",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "http://svc.default.svc.cluster.local:8080/api" {
			t.Fatalf("unexpected URL: %s", val)
		}
	})

	t.Run("serviceRef uses https for port 443", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{
					Name:      "svc",
					Namespace: "custom-ns",
					Port:      "443",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "https://svc.custom-ns.svc.cluster.local:443" {
			t.Fatalf("unexpected URL: %s", val)
		}
	})

	t.Run("rejects empty serviceRef name", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{},
			},
		}
		_, err := v.ResolveValueSource(ctx, vs, "default")
		if err == nil {
			t.Fatal("expected error for empty service name")
		}
	})

	t.Run("rejects empty valueFrom", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{}}
		_, err := v.ResolveValueSource(ctx, vs, "default")
		if err == nil {
			t.Fatal("expected error for empty valueFrom")
		}
	})
}

func TestCommonCollectMigrationWarnings(t *testing.T) {
	t.Run("collects warnings", func(t *testing.T) {
		anns := map[string]string{
			annotations.MigrationWarningPrefix + "a": "warning a",
			annotations.MigrationWarningPrefix + "b": "warning b",
			"unrelated-annotation":                   "value",
		}
		warnings := CollectMigrationWarnings(anns)
		if len(warnings) != 2 {
			t.Fatalf("expected 2 warnings, got %d", len(warnings))
		}
	})

	t.Run("returns empty for no warnings", func(t *testing.T) {
		warnings := CollectMigrationWarnings(map[string]string{"key": "val"})
		if len(warnings) != 0 {
			t.Fatalf("expected 0 warnings, got %d", len(warnings))
		}
	})

	t.Run("handles nil annotations", func(t *testing.T) {
		warnings := CollectMigrationWarnings(nil)
		if len(warnings) != 0 {
			t.Fatalf("expected 0 warnings, got %d", len(warnings))
		}
	})
}

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

func TestCommonResourceExists(t *testing.T) {
	lookup := newMockLookup()
	lookup.addResource("Agent", "default", "exists", &arkv1alpha1.Agent{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("returns nil for empty name", func(t *testing.T) {
		err := v.ResourceExists(ctx, "Agent", "default", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns nil for existing resource", func(t *testing.T) {
		err := v.ResourceExists(ctx, "Agent", "default", "exists")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for nonexistent resource", func(t *testing.T) {
		err := v.ResourceExists(ctx, "Agent", "default", "nonexistent")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestCommonSecretKeyExists(t *testing.T) {
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("returns nil for empty name", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "", "key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns nil for empty key", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "s1", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for nonexistent secret", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "nonexistent", "key")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("returns error for missing key", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "s1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("returns nil for existing key", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "s1", "key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCommonConfigMapKeyExists(t *testing.T) {
	lookup := newMockLookup()
	lookup.addConfigMap("default", "cm1", map[string]string{"key": "val"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("returns nil for empty name", func(t *testing.T) {
		err := v.ConfigMapKeyExists(ctx, "default", "", "key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for nonexistent configmap", func(t *testing.T) {
		err := v.ConfigMapKeyExists(ctx, "default", "nonexistent", "key")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("returns error for missing key", func(t *testing.T) {
		err := v.ConfigMapKeyExists(ctx, "default", "cm1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestCommonValidateValueSource(t *testing.T) {
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("nil source returns nil", func(t *testing.T) {
		err := v.ValidateValueSource(ctx, nil, "default", "field")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("source without valueFrom returns nil", func(t *testing.T) {
		err := v.ValidateValueSource(ctx, &arkv1alpha1.ValueSource{Value: "v"}, "default", "field")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("validates secretKeyRef", func(t *testing.T) {
		vs := &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "nonexistent"},
					Key:                  "key",
				},
			},
		}
		err := v.ValidateValueSource(ctx, vs, "default", "field")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates configMapKeyRef", func(t *testing.T) {
		vs := &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "nonexistent"},
					Key:                  "key",
				},
			},
		}
		err := v.ValidateValueSource(ctx, vs, "default", "field")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestValidatePollInterval(t *testing.T) {
	t.Run("accepts zero", func(t *testing.T) {
		if err := ValidatePollInterval(0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts positive", func(t *testing.T) {
		if err := ValidatePollInterval(5 * time.Second); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects negative", func(t *testing.T) {
		if err := ValidatePollInterval(-1 * time.Second); err == nil {
			t.Fatal("expected error")
		}
	})
}
