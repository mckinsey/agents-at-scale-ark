//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/genai"
)

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
