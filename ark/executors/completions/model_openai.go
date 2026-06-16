package completions

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

	headers, err := resolveHeadersAndMerge(ctx, resolver, config.Headers, namespace, additionalHeaders)
	if err != nil {
		return err
	}

	properties, err := resolveProperties(ctx, resolver, config.Properties, namespace, "OpenAI")
	if err != nil {
		return err
	}

	model.Provider = &OpenAIProvider{
		Model:      model.Model,
		BaseURL:    baseURL,
		APIKey:     apiKey,
		Headers:    headers,
		Properties: properties,
	}
	model.Properties = properties

	return nil
}
