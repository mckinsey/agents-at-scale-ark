package genai

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func loadAzureConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AzureModelConfig, namespace string, model *Model, additionalHeaders map[string]string) error {
	if config == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}

	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Azure baseURL: %w", err)
	}

	apiKey, err := resolver.ResolveValueSource(ctx, config.APIKey, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Azure apiKey: %w", err)
	}

	var apiVersion string
	if config.APIVersion != nil {
		apiVersion, err = resolver.ResolveValueSource(ctx, *config.APIVersion, namespace)
		if err != nil {
			return fmt.Errorf("failed to resolve Azure apiVersion: %w", err)
		}
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
				return fmt.Errorf("failed to resolve Azure property %s: %w", key, err)
			}
			properties[key] = value
		}
	}

	azureProvider := &AzureProvider{
		Model:      model.Model,
		BaseURL:    baseURL,
		APIKey:     apiKey,
		APIVersion: apiVersion,
		Headers:    headers,
		Properties: properties,
	}
	model.Provider = azureProvider
	model.Properties = properties

	return nil
}
