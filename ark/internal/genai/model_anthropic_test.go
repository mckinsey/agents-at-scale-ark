package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func TestLoadAnthropicConfig_NilConfig(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "messages",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, nil, "default", model, nil)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "anthropic configuration is required")
}

func TestLoadAnthropicConfig_Success(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			Value: "https://api.anthropic.com/v1",
		},
		APIKey: arkv1alpha1.ValueSource{
			Value: "sk-ant-test-key",
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "messages",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, nil)

	assert.NoError(t, err)
	assert.NotNil(t, model.Provider)

	provider, ok := model.Provider.(*AnthropicProvider)
	assert.True(t, ok)
	assert.Equal(t, "claude-3-haiku-20240307", provider.Model)
	assert.Equal(t, "https://api.anthropic.com/v1", provider.BaseURL)
	assert.Equal(t, "sk-ant-test-key", provider.APIKey)
}

func TestLoadAnthropicConfig_WithProperties(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			Value: "https://api.anthropic.com/v1",
		},
		APIKey: arkv1alpha1.ValueSource{
			Value: "sk-ant-test-key",
		},
		Properties: map[string]arkv1alpha1.ValueSource{
			"temperature": {Value: "0.7"},
			"max_tokens":  {Value: "2048"},
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "anthropic",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, nil)

	assert.NoError(t, err)
	provider, ok := model.Provider.(*AnthropicProvider)
	assert.True(t, ok)
	assert.Equal(t, "0.7", provider.Properties["temperature"])
	assert.Equal(t, "2048", provider.Properties["max_tokens"])
}

func TestLoadAnthropicConfig_WithConfigMapRef(t *testing.T) {
	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "anthropic-config",
			Namespace: "default",
		},
		Data: map[string]string{
			"base-url": "https://custom.api.com",
		},
	}

	fakeClient := fake.NewClientBuilder().WithObjects(configMap).Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: "anthropic-config",
					},
					Key: "base-url",
				},
			},
		},
		APIKey: arkv1alpha1.ValueSource{
			Value: "sk-ant-test-key",
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "anthropic",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, nil)

	assert.NoError(t, err)
	provider, ok := model.Provider.(*AnthropicProvider)
	assert.True(t, ok)
	assert.Equal(t, "https://custom.api.com", provider.BaseURL)
}

func TestLoadAnthropicConfig_WithSecretRef(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "anthropic-secret",
			Namespace: "default",
		},
		Data: map[string][]byte{
			"api-key": []byte("sk-ant-secret-key"),
		},
	}

	fakeClient := fake.NewClientBuilder().WithObjects(secret).Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			Value: "https://api.anthropic.com/v1",
		},
		APIKey: arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: "anthropic-secret",
					},
					Key: "api-key",
				},
			},
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "anthropic",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, nil)

	assert.NoError(t, err)
	provider, ok := model.Provider.(*AnthropicProvider)
	assert.True(t, ok)
	assert.Equal(t, "sk-ant-secret-key", provider.APIKey)
}

func TestLoadAnthropicConfig_WithAdditionalHeaders(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			Value: "https://api.anthropic.com/v1",
		},
		APIKey: arkv1alpha1.ValueSource{
			Value: "sk-ant-test-key",
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "messages",
	}

	additionalHeaders := map[string]string{
		"X-Custom-Header": "custom-value",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, additionalHeaders)

	assert.NoError(t, err)
	provider, ok := model.Provider.(*AnthropicProvider)
	assert.True(t, ok)
	assert.Equal(t, "custom-value", provider.Headers["X-Custom-Header"])
}

func TestLoadAnthropicConfig_BaseURLResolutionError(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: "nonexistent-config",
					},
					Key: "base-url",
				},
			},
		},
		APIKey: arkv1alpha1.ValueSource{
			Value: "sk-ant-test-key",
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "messages",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, nil)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to resolve Anthropic baseURL")
}

func TestLoadAnthropicConfig_APIKeyResolutionError(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	config := &arkv1alpha1.AnthropicModelConfig{
		BaseURL: arkv1alpha1.ValueSource{
			Value: "https://api.anthropic.com/v1",
		},
		APIKey: arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: "nonexistent-secret",
					},
					Key: "api-key",
				},
			},
		},
	}

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "messages",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, config, "default", model, nil)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to resolve Anthropic apiKey")
}
