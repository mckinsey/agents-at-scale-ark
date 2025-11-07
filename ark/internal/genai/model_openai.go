package genai

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func loadOpenAIConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.OpenAIModelConfig, namespace string, model *Model, additionalHeaders map[string]string) error {
	if config == nil {
		return fmt.Errorf("openai configuration is required for openai model type")
	}

	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve OpenAI baseURL: %w", err)
	}

	apiKey, err := resolver.ResolveValueSource(ctx, config.APIKey, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve OpenAI apiKey: %w", err)
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
				return fmt.Errorf("failed to resolve OpenAI property %s: %w", key, err)
			}
			properties[key] = value
		}
	}

	openaiProvider := &OpenAIProvider{
		Model:      model.Model,
		BaseURL:    baseURL,
		APIKey:     apiKey,
		Headers:    headers,
		Properties: properties,
	}
	model.Provider = openaiProvider
	model.Properties = properties

	return nil
}
