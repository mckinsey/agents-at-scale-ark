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

func (v *Validator) validateAzureAuth(ctx context.Context, azure *arkv1alpha1.AzureModelConfig, ns string) error {
	if azure.Auth == nil {
		if azure.APIKey == nil {
			return fmt.Errorf("spec.config.azure.apiKey or spec.config.azure.auth is required")
		}
		return v.ValidateValueSource(ctx, azure.APIKey, ns, "spec.config.azure.apiKey")
	}
	auth := azure.Auth
	n := 0
	if auth.APIKey != nil {
		n++
	}
	if auth.ManagedIdentity != nil {
		n++
	}
	if auth.WorkloadIdentity != nil {
		n++
	}
	if n != 1 {
		return fmt.Errorf("spec.config.azure.auth must have exactly one of apiKey, managedIdentity, or workloadIdentity")
	}
	if auth.APIKey != nil {
		return v.ValidateValueSource(ctx, auth.APIKey, ns, "spec.config.azure.auth.apiKey")
	}
	if auth.ManagedIdentity != nil && auth.ManagedIdentity.ClientID != nil {
		if err := v.ValidateValueSource(ctx, auth.ManagedIdentity.ClientID, ns, "spec.config.azure.auth.managedIdentity.clientId"); err != nil {
			return err
		}
	}
	if auth.WorkloadIdentity != nil {
		if err := v.ValidateValueSource(ctx, &auth.WorkloadIdentity.ClientID, ns, "spec.config.azure.auth.workloadIdentity.clientId"); err != nil {
			return err
		}
		if err := v.ValidateValueSource(ctx, &auth.WorkloadIdentity.TenantID, ns, "spec.config.azure.auth.workloadIdentity.tenantId"); err != nil {
			return err
		}
	}
	return nil
}

func (v *Validator) validateAzureConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Azure == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}
	azure := model.Spec.Config.Azure
	ns := model.GetNamespace()
	if err := v.ValidateValueSource(ctx, &azure.BaseURL, ns, "spec.config.azure.baseUrl"); err != nil {
		return err
	}
	if azure.APIVersion != nil {
		if err := v.ValidateValueSource(ctx, azure.APIVersion, ns, "spec.config.azure.apiVersion"); err != nil {
			return err
		}
	}
	if err := v.validateAzureAuth(ctx, azure, ns); err != nil {
		return err
	}
	if _, err := v.ResolveValueSource(ctx, azure.BaseURL, ns); err != nil {
		return fmt.Errorf("failed to resolve Azure BaseURL: %w", err)
	}
	for i, header := range azure.Headers {
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
