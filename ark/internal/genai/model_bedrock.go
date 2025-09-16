package genai

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func loadBedrockConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.BedrockModelConfig, namespace, modelName string, model *Model) error {
	if config == nil {
		return nil
	}

	region := resolveOptionalValue(ctx, resolver, config.Region, namespace)
	baseURL := resolveOptionalValue(ctx, resolver, config.BaseURL, namespace)
	accessKeyID := resolveOptionalValue(ctx, resolver, config.AccessKeyID, namespace)
	secretAccessKey := resolveOptionalValue(ctx, resolver, config.SecretAccessKey, namespace)
	sessionToken := resolveOptionalValue(ctx, resolver, config.SessionToken, namespace)
	modelArn := resolveOptionalValue(ctx, resolver, config.ModelArn, namespace)

	var properties map[string]string
	if config.Properties != nil {
		properties = make(map[string]string)
		for key, valueSource := range config.Properties {
			value, err := resolver.ResolveValueSource(ctx, valueSource, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve Bedrock property %s: %w", key, err)
			}
			properties[key] = value
		}
	}

	if config.MaxTokens != nil {
		if properties == nil {
			properties = make(map[string]string)
		}
		properties["max_tokens"] = fmt.Sprintf("%d", *config.MaxTokens)
	}

	if config.Temperature != nil {
		if properties == nil {
			properties = make(map[string]string)
		}
		properties["temperature"] = *config.Temperature
	}

	bedrockModel := NewBedrockModel(modelName, region, baseURL, accessKeyID, secretAccessKey, sessionToken, modelArn, properties)
	model.Provider = bedrockModel
	model.Properties = properties

	return nil
}

func resolveOptionalValue(ctx context.Context, resolver *common.ValueSourceResolver, valueSource *arkv1alpha1.ValueSource, namespace string) string {
	if valueSource == nil {
		return ""
	}
	value, _ := resolver.ResolveValueSource(ctx, *valueSource, namespace)
	return value
}
