package genai

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

func loadOpenAIConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.OpenAIModelConfig, namespace string, model *Model) error {
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

	var headers map[string]string
	if len(config.Headers) > 0 {
		log := logf.FromContext(ctx)
		headers = make(map[string]string)
		log.Info("resolving custom headers for OpenAI model", "model", model.Model, "namespace", namespace, "header_count", len(config.Headers))
		for _, header := range config.Headers {
			value, err := ResolveModelHeaderValue(ctx, resolver.Client, header, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve OpenAI header %s: %w", header.Name, err)
			}
			headers[header.Name] = value
			log.Info("resolved custom header for OpenAI model", "model", model.Model, "header_name", header.Name)
		}
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
