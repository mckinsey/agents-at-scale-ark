//nolint:dupl // Provider-specific config loading, intentional similarity with model_openai.go
package genai

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func loadAnthropicConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AnthropicModelConfig, namespace string, model *Model, additionalHeaders map[string]string) error {
	if config == nil {
		return fmt.Errorf("anthropic configuration is required for anthropic model type")
	}

	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Anthropic baseURL: %w", err)
	}

	apiKey, err := resolver.ResolveValueSource(ctx, config.APIKey, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Anthropic apiKey: %w", err)
	}

	headers, err := resolveModelHeaders(ctx, resolver.Client, config.Headers, namespace)
	if err != nil {
		return err
	}

	for k, v := range additionalHeaders {
		headers[k] = v
	}

	var properties map[string]string
	if config.Properties != nil {
		properties = make(map[string]string)
		for key, valueSource := range config.Properties {
			value, err := resolver.ResolveValueSource(ctx, valueSource, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve Anthropic property %s: %w", key, err)
			}
			properties[key] = value
		}
	}

	anthropicProvider := &AnthropicProvider{
		Model:      model.Model,
		BaseURL:    baseURL,
		APIKey:     apiKey,
		Headers:    headers,
		Properties: properties,
	}
	model.Provider = anthropicProvider
	model.Properties = properties

	return nil
}
