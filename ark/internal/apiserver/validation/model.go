package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

type ModelValidator struct {
	*StorageValidator
}

func NewModelValidator(sv *StorageValidator) *ModelValidator {
	return &ModelValidator{StorageValidator: sv}
}

func (v *ModelValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	model, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		return fmt.Errorf("expected a Model object but got %T", obj)
	}
	return v.validateModel(ctx, model)
}

func (v *ModelValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	model, ok := newObj.(*arkv1alpha1.Model)
	if !ok {
		return fmt.Errorf("expected a Model object but got %T", newObj)
	}
	return v.validateModel(ctx, model)
}

func (v *ModelValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *ModelValidator) validateModel(ctx context.Context, model *arkv1alpha1.Model) error {
	if err := v.validateValueSource(ctx, &model.Spec.Model, model.GetNamespace(), "spec.model"); err != nil {
		return err
	}

	return v.validateProviderConfig(ctx, model)
}

func (v *ModelValidator) validateValueSource(ctx context.Context, vs *arkv1alpha1.ValueSource, namespace, fieldName string) error {
	if vs == nil || vs.ValueFrom == nil {
		return nil
	}

	if vs.ValueFrom.SecretKeyRef != nil {
		if err := v.ValidateSecretKeyExists(ctx, vs.ValueFrom.SecretKeyRef.Name, namespace, vs.ValueFrom.SecretKeyRef.Key); err != nil {
			return fmt.Errorf("%s: %w", fieldName, err)
		}
	}

	if vs.ValueFrom.ConfigMapKeyRef != nil {
		if err := v.ValidateConfigMapKeyExists(ctx, vs.ValueFrom.ConfigMapKeyRef.Name, namespace, vs.ValueFrom.ConfigMapKeyRef.Key); err != nil {
			return fmt.Errorf("%s: %w", fieldName, err)
		}
	}

	return nil
}

func (v *ModelValidator) validateProviderConfig(ctx context.Context, model *arkv1alpha1.Model) error {
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

func (v *ModelValidator) validateAzureConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Azure == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}

	if err := v.validateValueSource(ctx, &model.Spec.Config.Azure.BaseURL, model.GetNamespace(), "spec.config.azure.baseUrl"); err != nil {
		return err
	}
	if err := v.validateValueSource(ctx, &model.Spec.Config.Azure.APIKey, model.GetNamespace(), "spec.config.azure.apiKey"); err != nil {
		return err
	}
	if model.Spec.Config.Azure.APIVersion != nil {
		if err := v.validateValueSource(ctx, model.Spec.Config.Azure.APIVersion, model.GetNamespace(), "spec.config.azure.apiVersion"); err != nil {
			return err
		}
	}

	for i, header := range model.Spec.Config.Azure.Headers {
		contextPrefix := fmt.Sprintf("spec.config.azure.headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}

func (v *ModelValidator) validateOpenAIConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.OpenAI == nil {
		return fmt.Errorf("openai configuration is required for openai model type")
	}

	if err := v.validateValueSource(ctx, &model.Spec.Config.OpenAI.BaseURL, model.GetNamespace(), "spec.config.openai.baseUrl"); err != nil {
		return err
	}
	if err := v.validateValueSource(ctx, &model.Spec.Config.OpenAI.APIKey, model.GetNamespace(), "spec.config.openai.apiKey"); err != nil {
		return err
	}

	for i, header := range model.Spec.Config.OpenAI.Headers {
		contextPrefix := fmt.Sprintf("spec.config.openai.headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}

func (v *ModelValidator) validateBedrockConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Bedrock == nil {
		return fmt.Errorf("bedrock configuration is required for bedrock model type")
	}

	if model.Spec.Config.Bedrock.Region != nil {
		if err := v.validateValueSource(ctx, model.Spec.Config.Bedrock.Region, model.GetNamespace(), "spec.config.bedrock.region"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.AccessKeyID != nil {
		if err := v.validateValueSource(ctx, model.Spec.Config.Bedrock.AccessKeyID, model.GetNamespace(), "spec.config.bedrock.accessKeyId"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.SecretAccessKey != nil {
		if err := v.validateValueSource(ctx, model.Spec.Config.Bedrock.SecretAccessKey, model.GetNamespace(), "spec.config.bedrock.secretAccessKey"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.SessionToken != nil {
		if err := v.validateValueSource(ctx, model.Spec.Config.Bedrock.SessionToken, model.GetNamespace(), "spec.config.bedrock.sessionToken"); err != nil {
			return err
		}
	}
	if model.Spec.Config.Bedrock.ModelArn != nil {
		if err := v.validateValueSource(ctx, model.Spec.Config.Bedrock.ModelArn, model.GetNamespace(), "spec.config.bedrock.modelArn"); err != nil {
			return err
		}
	}

	return nil
}
