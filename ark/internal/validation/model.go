package validation

import (
	"context"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

func (v *Validator) ValidateModel(ctx context.Context, model *arkv1alpha1.Model) ([]string, error) {
	if err := v.ValidateValueSource(ctx, &model.Spec.Model, model.GetNamespace(), "spec.model"); err != nil {
		return nil, err
	}

	if err := v.validateProviderConfig(ctx, model); err != nil {
		return nil, err
	}

	return CollectMigrationWarnings(model.Annotations), nil
}

func (v *Validator) validateProviderConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	switch model.Spec.Provider {
	case genai.ProviderAzure:
		return v.validateAzureConfig(ctx, model)
	case genai.ProviderOpenAI:
		return v.validateOpenAIConfig(ctx, model)
	case genai.ProviderBedrock:
		return v.validateBedrockConfig(ctx, model)
	default:
		if model.Spec.Provider == "" {
			if genai.IsDeprecatedProviderInType(model.Spec.Type) {
				return fmt.Errorf("provider is required - update model to migrate '%s' from spec.type to spec.provider", model.Spec.Type)
			}
			return fmt.Errorf("provider is required")
		}
		return fmt.Errorf("unsupported provider: %s", model.Spec.Provider)
	}
}

func (v *Validator) validateAzureConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Azure == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}

	ns := model.GetNamespace()
	if err := v.ValidateValueSource(ctx, &model.Spec.Config.Azure.BaseURL, ns, "spec.config.azure.baseUrl"); err != nil {
		return err
	}
	if err := v.ValidateValueSource(ctx, &model.Spec.Config.Azure.APIKey, ns, "spec.config.azure.apiKey"); err != nil {
		return err
	}
	if model.Spec.Config.Azure.APIVersion != nil {
		if err := v.ValidateValueSource(ctx, model.Spec.Config.Azure.APIVersion, ns, "spec.config.azure.apiVersion"); err != nil {
			return err
		}
	}

	if _, err := v.ResolveValueSource(ctx, model.Spec.Config.Azure.BaseURL, ns); err != nil {
		return fmt.Errorf("failed to resolve Azure BaseURL: %w", err)
	}

	for i, header := range model.Spec.Config.Azure.Headers {
		contextPrefix := fmt.Sprintf("spec.config.azure.headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}

func (v *Validator) validateOpenAIConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.OpenAI == nil {
		return fmt.Errorf("openai configuration is required for openai model type")
	}

	ns := model.GetNamespace()
	if err := v.ValidateValueSource(ctx, &model.Spec.Config.OpenAI.BaseURL, ns, "spec.config.openai.baseUrl"); err != nil {
		return err
	}
	if err := v.ValidateValueSource(ctx, &model.Spec.Config.OpenAI.APIKey, ns, "spec.config.openai.apiKey"); err != nil {
		return err
	}

	if _, err := v.ResolveValueSource(ctx, model.Spec.Config.OpenAI.BaseURL, ns); err != nil {
		return fmt.Errorf("failed to resolve OpenAI BaseURL: %w", err)
	}

	for i, header := range model.Spec.Config.OpenAI.Headers {
		contextPrefix := fmt.Sprintf("spec.config.openai.headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}

func (v *Validator) validateBedrockConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Bedrock == nil {
		return fmt.Errorf("bedrock configuration is required for bedrock model type")
	}

	ns := model.GetNamespace()
	if model.Spec.Config.Bedrock.Region != nil {
		if err := v.ValidateValueSource(ctx, model.Spec.Config.Bedrock.Region, ns, "spec.config.bedrock.region"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.AccessKeyID != nil {
		if err := v.ValidateValueSource(ctx, model.Spec.Config.Bedrock.AccessKeyID, ns, "spec.config.bedrock.accessKeyId"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.SecretAccessKey != nil {
		if err := v.ValidateValueSource(ctx, model.Spec.Config.Bedrock.SecretAccessKey, ns, "spec.config.bedrock.secretAccessKey"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.SessionToken != nil {
		if err := v.ValidateValueSource(ctx, model.Spec.Config.Bedrock.SessionToken, ns, "spec.config.bedrock.sessionToken"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.ModelArn != nil {
		if err := v.ValidateValueSource(ctx, model.Spec.Config.Bedrock.ModelArn, ns, "spec.config.bedrock.modelArn"); err != nil {
			return err
		}
	}

	return nil
}
