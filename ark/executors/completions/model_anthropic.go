package completions

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func loadAnthropicConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AnthropicModelConfig, namespace string, model *Model, additionalHeaders map[string]string) error {
	if config == nil {
		return fmt.Errorf("anthropic configuration is required for anthropic provider")
	}

	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Anthropic baseURL: %w", err)
	}

	apiKey, err := resolver.ResolveValueSource(ctx, config.APIKey, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Anthropic apiKey: %w", err)
	}

	var version string
	if config.Version != nil {
		version, err = resolver.ResolveValueSource(ctx, *config.Version, namespace)
		if err != nil {
			return fmt.Errorf("failed to resolve Anthropic version: %w", err)
		}
	}

	headers, err := resolveHeadersAndMerge(ctx, resolver, config.Headers, namespace, additionalHeaders)
	if err != nil {
		return err
	}

	properties, err := resolveProperties(ctx, resolver, config.Properties, namespace, "Anthropic")
	if err != nil {
		return err
	}

	model.Provider = &AnthropicProvider{
		Model:      model.Model,
		BaseURL:    baseURL,
		APIKey:     apiKey,
		Version:    version,
		Headers:    headers,
		Properties: properties,
	}
	model.Properties = properties

	return nil
}
