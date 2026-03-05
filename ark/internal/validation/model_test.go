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

func TestValidateModel(t *testing.T) { //nolint:gocognit,gocyclo,cyclop
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
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com"},
						APIKey:  &arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid azure model with Auth.APIKey", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com"},
						Auth: &arkv1alpha1.AzureAuth{
							APIKey: &arkv1alpha1.ValueSource{Value: "key"},
						},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid azure model with Auth.ManagedIdentity", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com"},
						Auth: &arkv1alpha1.AzureAuth{
							ManagedIdentity: &arkv1alpha1.AzureManagedIdentity{},
						},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid azure model with Auth.ManagedIdentity and clientId", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com"},
						Auth: &arkv1alpha1.AzureAuth{
							ManagedIdentity: &arkv1alpha1.AzureManagedIdentity{
								ClientID: &arkv1alpha1.ValueSource{Value: "client-id"},
							},
						},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid azure model with Auth.WorkloadIdentity", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com"},
						Auth: &arkv1alpha1.AzureAuth{
							WorkloadIdentity: &arkv1alpha1.AzureWorkloadIdentity{
								ClientID: arkv1alpha1.ValueSource{Value: "wi-client-id"},
								TenantID: arkv1alpha1.ValueSource{Value: "wi-tenant-id"},
							},
						},
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
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com"},
						APIKey:  &arkv1alpha1.ValueSource{Value: "key"},
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

	t.Run("rejects openai model with non-whitelisted domain", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://evil.com/capture"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for non-allowlisted domain")
		}
		if !contains(err.Error(), "domain not in whitelist") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("rejects azure model with private IP", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://10.0.0.1/api"},
						APIKey:  &arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for private IP")
		}
		if !contains(err.Error(), "private IP addresses are not allowed") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("rejects openai model with HTTP external URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "http://api.openai.com/v1"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for HTTP external URL")
		}
		if !contains(err.Error(), "must use HTTPS") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("accepts openai model with valid HTTPS URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.openai.com/v1"},
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

	t.Run("accepts azure model with subdomain", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderAzure,
				Config: arkv1alpha1.ModelConfig{
					Azure: &arkv1alpha1.AzureModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://my-resource.openai.azure.com/openai/deployments/gpt-4"},
						APIKey:  &arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects localhost HTTP URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "http://localhost:8080/v1"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for localhost HTTP URL")
		}
		if !contains(err.Error(), "must use HTTPS") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("rejects kubernetes service URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "http://model-service.default.svc.cluster.local/v1"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for kubernetes service URL")
		}
		if !contains(err.Error(), "must use HTTPS") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("rejects AWS metadata service URL (HTTP)", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "http://169.254.169.254/latest/meta-data"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for metadata service IP with HTTP")
		}
		if !contains(err.Error(), "must use HTTPS") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("rejects AWS metadata service URL (HTTPS)", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: genai.ProviderOpenAI,
				Config: arkv1alpha1.ModelConfig{
					OpenAI: &arkv1alpha1.OpenAIModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://169.254.169.254/latest/meta-data"},
						APIKey:  arkv1alpha1.ValueSource{Value: "key"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for metadata service IP with HTTPS")
		}
		if !contains(err.Error(), "metadata service IP range is not allowed") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})
}

func TestValidateBaseURL(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		wantError bool
		errorMsg  string
	}{
		{"OpenAI API", "https://api.openai.com/v1", false, ""},
		{"Azure OpenAI", "https://my-resource.openai.azure.com/openai/deployments/gpt-4", false, ""},
		{"Anthropic", "https://api.anthropic.com/v1", false, ""},
		{"Google Gemini", "https://generativelanguage.googleapis.com/v1", false, ""},
		{"AWS Bedrock", "https://bedrock-runtime.us-east-1.amazonaws.com/model/invoke", false, ""},

		{"Evil domain", "https://evil.com/capture", true, "domain not in whitelist"},
		{"Attacker server", "https://attacker.ngrok.io/steal", true, "domain not in whitelist"},
		{"Collaborator", "https://burpcollaborator.net/test", true, "domain not in whitelist"},
		{"Random domain", "https://example.com/api", true, "domain not in whitelist"},
		{"Localhost HTTP", "http://localhost:8080", true, "must use HTTPS"},
		{"Localhost HTTPS", "https://localhost:8080", true, "domain not in whitelist"},
		{"K8s service HTTP", "http://model-svc.default.svc.cluster.local", true, "must use HTTPS"},
		{"K8s service HTTPS", "https://model-svc.default.svc.cluster.local", true, "domain not in whitelist"},

		{"Private IP 10.x", "https://10.0.0.1/api", true, "private IP addresses are not allowed"},
		{"Private IP 192.168", "https://192.168.1.1/api", true, "private IP addresses are not allowed"},
		{"AWS metadata HTTP", "http://169.254.169.254/latest/meta-data", true, "must use HTTPS"},
		{"AWS metadata HTTPS", "https://169.254.169.254/latest/meta-data", true, "metadata service IP range is not allowed"},
		{"Loopback IP", "https://127.0.0.1/api", true, "loopback IP addresses are not allowed"},

		{"HTTP external", "http://api.openai.com/v1", true, "must use HTTPS"},
		{"File scheme", "file:///etc/passwd", true, "invalid URL format"},
		{"FTP scheme", "ftp://api.openai.com/file", true, "must use HTTPS"},

		{"Malformed URL", "not-a-url", true, "invalid URL format"},
		{"No hostname", "https:///api/v1", true, "URL must contain a hostname"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateBaseURL(tt.url)
			if (err != nil) != tt.wantError {
				t.Errorf("ValidateBaseURL() error = %v, wantError %v", err, tt.wantError)
			}
			if err != nil && tt.errorMsg != "" && !contains(err.Error(), tt.errorMsg) {
				t.Errorf("ValidateBaseURL() error = %v, expected to contain %q", err, tt.errorMsg)
			}
		})
	}
}

func TestIsWhitelistedDomain(t *testing.T) {
	tests := []struct {
		name     string
		hostname string
		want     bool
	}{
		{"OpenAI exact", "api.openai.com", true},
		{"Anthropic exact", "api.anthropic.com", true},

		{"Azure subdomain", "my-resource.openai.azure.com", true},
		{"Azure nested", "deeply.nested.openai.azure.com", true},

		{"Bedrock us-east-1", "bedrock-runtime.us-east-1.amazonaws.com", true},
		{"Bedrock eu-west-1", "bedrock-runtime.eu-west-1.amazonaws.com", true},

		{"Evil domain", "evil.com", false},
		{"Not OpenAI", "openai.com", false},
		{"Fake Azure", "openai.azure.evil.com", false},
		{"S3", "s3.amazonaws.com", false},
		{"Localhost", "localhost", false},
		{"K8s service", "my-service.default.svc.cluster.local", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isWhitelistedDomain(tt.hostname)
			if got != tt.want {
				t.Errorf("isWhitelistedDomain(%s) = %v, want %v", tt.hostname, got, tt.want)
			}
		})
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && (s == substr || len(s) >= len(substr) && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
