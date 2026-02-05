package genai

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"k8s.io/apimachinery/pkg/runtime"
)

func TestAnthropicProvider_BuildConfig(t *testing.T) {
	tests := []struct {
		name     string
		provider *AnthropicProvider
		expected map[string]any
	}{
		{
			name: "full config with all fields",
			provider: &AnthropicProvider{
				Model:   "claude-3-haiku-20240307",
				BaseURL: "https://api.anthropic.com/v1",
				APIKey:  "sk-ant-test-key",
				Headers: map[string]string{"X-Custom": "value"},
				Properties: map[string]string{
					"temperature": "0.7",
					"max_tokens":  "2048",
				},
			},
			expected: map[string]any{
				"baseUrl": "https://api.anthropic.com/v1",
				"apiKey":  "sk-ant-test-key",
			},
		},
		{
			name: "config without api key",
			provider: &AnthropicProvider{
				Model:   "claude-3-haiku-20240307",
				BaseURL: "https://api.anthropic.com/v1",
				APIKey:  "",
			},
			expected: map[string]any{
				"baseUrl": "https://api.anthropic.com/v1",
			},
		},
		{
			name: "minimal config",
			provider: &AnthropicProvider{
				BaseURL: "https://custom.api.com",
			},
			expected: map[string]any{
				"baseUrl": "https://custom.api.com",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := tt.provider.BuildConfig()
			assert.Equal(t, tt.expected, config)
		})
	}
}

func TestAnthropicProvider_SetOutputSchema(t *testing.T) {
	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: "https://api.anthropic.com/v1",
		APIKey:  "test-key",
	}

	schema := &runtime.RawExtension{
		Raw: []byte(`{"type": "object", "properties": {"name": {"type": "string"}}}`),
	}
	schemaName := "test-schema"

	// Should not panic
	provider.SetOutputSchema(schema, schemaName)

	// Verify internal state was set
	assert.Equal(t, schema, provider.outputSchema)
	assert.Equal(t, schemaName, provider.schemaName)
}

func TestAnthropicProvider_SetOutputSchema_Nil(t *testing.T) {
	provider := &AnthropicProvider{
		Model:   "claude-3-haiku-20240307",
		BaseURL: "https://api.anthropic.com/v1",
		APIKey:  "test-key",
	}

	// Should not panic with nil schema
	provider.SetOutputSchema(nil, "")

	assert.Nil(t, provider.outputSchema)
	assert.Equal(t, "", provider.schemaName)
}
