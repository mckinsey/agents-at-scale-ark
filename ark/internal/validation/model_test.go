//nolint:goconst
package validation

import (
	"context"
	"os"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
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
				Type:  ModelTypeCompletions,
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
				Type:  ProviderOpenAI,
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
				Provider: ProviderAzure,
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
				Provider: ProviderOpenAI,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for openai without config")
		}
	})

	t.Run("rejects anthropic without config", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "claude-sonnet-4-20250514"},
				Provider: ProviderAnthropic,
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for anthropic without config")
		}
	})

	t.Run("valid anthropic model", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "claude-sonnet-4-20250514"},
				Provider: ProviderAnthropic,
				Config: arkv1alpha1.ModelConfig{
					Anthropic: &arkv1alpha1.AnthropicModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.anthropic.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "sk-ant-test"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid anthropic model with all fields", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "claude-sonnet-4-20250514"},
				Provider: ProviderAnthropic,
				Config: arkv1alpha1.ModelConfig{
					Anthropic: &arkv1alpha1.AnthropicModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.anthropic.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "sk-ant-test"},
						Version: &arkv1alpha1.ValueSource{Value: "2023-06-01"},
						Headers: []arkv1alpha1.Header{
							{Name: "X-Custom", Value: arkv1alpha1.HeaderValue{Value: "val"}},
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

	t.Run("rejects anthropic model with HTTP URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "claude-sonnet-4-20250514"},
				Provider: ProviderAnthropic,
				Config: arkv1alpha1.ModelConfig{
					Anthropic: &arkv1alpha1.AnthropicModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "http://api.anthropic.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "sk-ant-test"},
					},
				},
			},
		}
		_, err := v.ValidateModel(ctx, model)
		if err == nil {
			t.Fatal("expected error for HTTP URL")
		}
		if !contains(err.Error(), "must use HTTPS") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("anthropic validates headers", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "claude-sonnet-4-20250514"},
				Provider: ProviderAnthropic,
				Config: arkv1alpha1.ModelConfig{
					Anthropic: &arkv1alpha1.AnthropicModelConfig{
						BaseURL: arkv1alpha1.ValueSource{Value: "https://api.anthropic.com"},
						APIKey:  arkv1alpha1.ValueSource{Value: "sk-ant-test"},
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

	t.Run("rejects bedrock without config", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "model"},
				Provider: ProviderBedrock,
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
				Provider: ProviderAzure,
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
				Provider: ProviderAzure,
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
				Provider: ProviderAzure,
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
				Provider: ProviderAzure,
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
				Provider: ProviderAzure,
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
				Provider: ProviderBedrock,
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
				Provider: ProviderAzure,
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
				Provider: ProviderOpenAI,
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
				Provider: ProviderOpenAI,
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

	t.Run("validates openai model with HTTPS URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: ProviderOpenAI,
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

	t.Run("rejects openai model with HTTP URL", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: ProviderOpenAI,
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
			t.Fatal("expected error for HTTP URL")
		}
		if !contains(err.Error(), "must use HTTPS") {
			t.Fatalf("unexpected error message: %v", err)
		}
	})

	t.Run("accepts azure model with subdomain", func(t *testing.T) {
		model := &arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.ModelSpec{
				Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
				Provider: ProviderAzure,
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
}

func TestValidateBaseURL(t *testing.T) { //nolint:gocognit,gocyclo,cyclop
	t.Run("Block non-network schemes (file://, ftp://, etc.)", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name   string
			url    string
			scheme string
		}{
			{"file scheme", "file:///etc/passwd", "file"},
			{"ftp scheme", "ftp://example.com/file", "ftp"},
			{"data scheme", "data:text/plain,hello", "data"},
			{"javascript scheme", "javascript:alert(1)", "javascript"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatalf("expected error for %s scheme, got nil", tt.scheme)
				}
				if !contains(err.Error(), "unsupported scheme") {
					t.Errorf("expected 'unsupported scheme' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Validate scheme is present and well-formed", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name string
			url  string
		}{
			{"no scheme", "api.openai.com/v1"},
			{"just path", "/api/v1"},
			{"relative path", "api/v1"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatal("expected error for missing scheme, got nil")
				}
				if !contains(err.Error(), "missing scheme") && !contains(err.Error(), "invalid URL format") {
					t.Errorf("expected 'missing scheme' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Validate hostname (reject malformed URLs like https:///api/v1)", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name string
			url  string
		}{
			{"no hostname", "https:///api/v1"},
			{"only port", "https://:8080/api"},
			{"empty host", "https://"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatal("expected error for missing hostname, got nil")
				}
				if !contains(err.Error(), "must contain a hostname") {
					t.Errorf("expected 'must contain a hostname' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Enforce HTTPS-only", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name string
			url  string
		}{
			{"HTTP to public domain", "http://api.openai.com/v1"},
			{"HTTP to custom domain", "http://custom.example.com/v1"},
			{"HTTP to IP", "http://93.184.216.34/api"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatal("expected error for HTTP scheme, got nil")
				}
				if !contains(err.Error(), "must use HTTPS") {
					t.Errorf("expected 'must use HTTPS' error, got: %v", err)
				}
			})
		}

		err := ValidateBaseURL("https://api.openai.com/v1")
		if err != nil {
			t.Errorf("HTTPS should be allowed, got error: %v", err)
		}
	})

	t.Run("Allow HTTP for cluster-internal services", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name string
			url  string
		}{
			{"Cluster service - short name", "http://mock-openai.svc.cluster.local/v1"},
			{"Cluster service - with namespace", "http://mock-openai.default.svc.cluster.local/v1"},
			{"Cluster service - with port", "http://service.namespace.svc.cluster.local:8080/api"},
			{"Cluster service - root domain", "http://service.svc.cluster.local"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err != nil {
					t.Errorf("HTTP should be allowed for cluster-internal services, got error: %v", err)
				}
			})
		}

		nonClusterTests := []struct {
			name string
			url  string
		}{
			{"HTTP to external domain", "http://api.openai.com/v1"},
			{"HTTP to similar but not cluster domain", "http://evil.svc.cluster.local.attacker.com/v1"},
		}

		for _, tt := range nonClusterTests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatal("expected error for non-cluster HTTP URL, got nil")
				}
				if !contains(err.Error(), "must use HTTPS") {
					t.Errorf("expected 'must use HTTPS' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Block loopback addresses (127.0.0.1, ::1)", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name string
			url  string
		}{
			{"IPv4 loopback 127.0.0.1", "https://127.0.0.1/api"},
			{"IPv4 loopback 127.0.0.2", "https://127.0.0.2/api"},
			{"IPv4 loopback 127.1.1.1", "https://127.1.1.1/api"},
			{"IPv6 loopback ::1", "https://[::1]/api"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatalf("expected error for loopback address, got nil")
				}
				if !contains(err.Error(), "loopback IP addresses are not allowed") {
					t.Errorf("expected 'loopback IP addresses are not allowed' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Block private IP ranges (RFC 1918)", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name    string
			url     string
			ipRange string
		}{
			{"10.0.0.0/8 range", "https://10.0.0.1/api", "10.0.0.0/8"},
			{"10.x.x.x high range", "https://10.255.255.254/api", "10.0.0.0/8"},
			{"172.16.0.0/12 range", "https://172.16.0.1/api", "172.16.0.0/12"},
			{"172.16-31 mid range", "https://172.20.1.1/api", "172.16.0.0/12"},
			{"192.168.0.0/16 range", "https://192.168.0.1/api", "192.168.0.0/16"},
			{"192.168.x.x high range", "https://192.168.255.254/api", "192.168.0.0/16"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatalf("expected error for private IP range %s, got nil", tt.ipRange)
				}
				if !contains(err.Error(), "private IP addresses are not allowed") {
					t.Errorf("expected 'private IP addresses are not allowed' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Block cloud metadata service IPs (169.254.169.254)", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")

		tests := []struct {
			name string
			url  string
		}{
			{"AWS/Azure metadata IP", "https://169.254.169.254/latest/meta-data"},
			{"Metadata range start", "https://169.254.0.1/meta"},
			{"Metadata range end", "https://169.254.255.254/meta"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatal("expected error for metadata service IP, got nil")
				}
				if !contains(err.Error(), "metadata service IP range is not allowed") {
					t.Errorf("expected 'metadata service IP range is not allowed' error, got: %v", err)
				}
			})
		}
	})

	t.Run("Support wildcard/glob patterns (*.prod.example.com)", func(t *testing.T) {
		_ = os.Setenv("WHITELISTED_MODEL_DOMAINS", "*.prod.example.com\n*.staging.example.com\napi.openai.com")
		defer func() { _ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS") }()

		tests := []struct {
			name      string
			url       string
			wantError bool
		}{
			{"Wildcard *.prod - single level", "https://llm.prod.example.com/v1", false},
			{"Wildcard *.prod - nested", "https://deep.nested.prod.example.com/v1", false},
			{"Wildcard *.prod - base domain", "https://prod.example.com/v1", false},
			{"Wildcard *.staging", "https://api.staging.example.com/v1", false},
			{"Exact match", "https://api.openai.com/v1", false},
			{"No match - wrong subdomain", "https://dev.example.com/v1", true},
			{"No match - different domain", "https://prod.other.com/v1", true},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if (err != nil) != tt.wantError {
					t.Errorf("ValidateBaseURL() error = %v, wantError %v", err, tt.wantError)
				}
			})
		}
	})

	t.Run("Allow specific private IP ranges when configured", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Setenv("ALLOWED_PRIVATE_IP_RANGES", "10.100.0.0/16\n192.168.50.0/24\n172.16.1.0/24")
		defer func() { _ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES") }()

		tests := []struct {
			name      string
			url       string
			wantError bool
			reason    string
		}{
			{"In allowlist 10.100.x.x", "https://10.100.0.1/v1", false, "10.100.0.0/16"},
			{"In allowlist 10.100.50.x", "https://10.100.50.100/v1", false, "10.100.0.0/16"},
			{"In allowlist 192.168.50.x", "https://192.168.50.10/v1", false, "192.168.50.0/24"},
			{"In allowlist 172.16.1.x", "https://172.16.1.50/v1", false, "172.16.1.0/24"},
			{"Not in allowlist 10.0.x.x", "https://10.0.0.1/v1", true, "different 10.x range"},
			{"Not in allowlist 192.168.1.x", "https://192.168.1.100/v1", true, "different 192.168 range"},
			{"Loopback still blocked", "https://127.0.0.1/v1", true, "loopback cannot be allowed"},
			{"Metadata still blocked", "https://169.254.169.254/v1", true, "metadata cannot be allowed"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if (err != nil) != tt.wantError {
					t.Errorf("ValidateBaseURL() error = %v, wantError %v (reason: %s)", err, tt.wantError, tt.reason)
				}
			})
		}
	})

	t.Run("Loopback and metadata CANNOT be bypassed via allowlist", func(t *testing.T) {
		_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
		_ = os.Setenv("ALLOWED_PRIVATE_IP_RANGES", "127.0.0.0/8\n169.254.0.0/16\n10.0.0.0/8")
		defer func() { _ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES") }()

		tests := []struct {
			name string
			url  string
		}{
			{"Loopback 127.0.0.1 in allowlist", "https://127.0.0.1/api"},
			{"Loopback 127.1.1.1 in allowlist", "https://127.1.1.1/api"},
			{"IPv6 loopback ::1 in allowlist", "https://[::1]/api"},
			{"Metadata 169.254.169.254 in allowlist", "https://169.254.169.254/meta-data"},
			{"Metadata 169.254.0.1 in allowlist", "https://169.254.0.1/meta"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				err := ValidateBaseURL(tt.url)
				if err == nil {
					t.Fatalf("expected error for %s even with allowlist, got nil", tt.url)
				}
				if !contains(err.Error(), "loopback") && !contains(err.Error(), "metadata") {
					t.Errorf("expected loopback/metadata error, got: %v", err)
				}
			})
		}
	})
}

func TestIsWhitelistedDomain(t *testing.T) {
	whitelist := []string{"api.openai.com", "openai.azure.com", "amazonaws.com"}

	tests := []struct {
		name     string
		hostname string
		want     bool
	}{
		{"Exact match", "api.openai.com", true},
		{"Subdomain", "my.openai.azure.com", true},
		{"AWS subdomain bedrock", "bedrock-runtime.us-east-1.amazonaws.com", true},
		{"Not in list", "evil.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isWhitelistedDomain(tt.hostname, whitelist)
			if got != tt.want {
				t.Errorf("isWhitelistedDomain(%s) = %v, want %v", tt.hostname, got, tt.want)
			}
		})
	}
}

func TestMatchDomainPattern(t *testing.T) {
	tests := []struct {
		name     string
		hostname string
		pattern  string
		want     bool
	}{
		{"Wildcard prefix match", "llm.prod.example.com", "*.prod.example.com", true},
		{"Wildcard base match", "prod.example.com", "*.prod.example.com", true},
		{"Wildcard no match", "dev.example.com", "*.prod.example.com", false},
		{"Exact match", "api.openai.com", "api.openai.com", true},
		{"Subdomain match", "sub.example.com", "example.com", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchDomainPattern(tt.hostname, tt.pattern)
			if got != tt.want {
				t.Errorf("matchDomainPattern(%s, %s) = %v, want %v", tt.hostname, tt.pattern, got, tt.want)
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
