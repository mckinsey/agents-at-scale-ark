/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/genai"
)

var modellog = logf.Log.WithName("model-resource")

func SetupModelWebhookWithManager(mgr ctrl.Manager) error {
	k8sClient := mgr.GetClient()
	return ctrl.NewWebhookManagedBy(mgr).
		For(&arkv1alpha1.Model{}).
		WithDefaulter(&ModelCustomDefaulter{}).
		WithValidator(&ModelValidator{
			Client:    k8sClient,
			Resolver:  common.NewValueSourceResolver(k8sClient),
			Validator: &ResourceValidator{Client: k8sClient},
		}).
		Complete()
}

// +kubebuilder:webhook:path=/mutate-ark-mckinsey-com-v1alpha1-model,mutating=true,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=models,verbs=create;update,versions=v1alpha1,name=mmodel-v1.kb.io,admissionReviewVersions=v1

type ModelCustomDefaulter struct{}

var _ webhook.CustomDefaulter = &ModelCustomDefaulter{}

func (d *ModelCustomDefaulter) Default(ctx context.Context, obj runtime.Object) error {
	model, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		return fmt.Errorf("expected a Model object but got %T", obj)
	}

	// Migration: spec.type used to hold provider values (openai, azure, bedrock).
	// Now spec.provider holds the provider and spec.type holds the model type (completions).
	// This mutating webhook auto-migrates old format to new format for backward compatibility.
	//
	// Before (deprecated):
	//   spec:
	//     type: openai
	//     model: gpt-4
	//
	// After (migrated):
	//   spec:
	//     type: completions
	//     provider: openai
	//     model: gpt-4
	//
	// A migration warning annotation is added so the validating webhook can surface
	// a deprecation warning to the user via admission.Warnings.
	//
	// This automatic migration will be removed in v1.0.0. Users must update their
	// manifests to use the new format before upgrading to v1.0.0.
	if model.Spec.Provider == "" && genai.IsDeprecatedProviderInType(model.Spec.Type) {
		originalType := model.Spec.Type
		model.Spec.Provider = model.Spec.Type
		model.Spec.Type = genai.ModelTypeCompletions

		if model.Annotations == nil {
			model.Annotations = make(map[string]string)
		}
		model.Annotations[annotations.MigrationWarningPrefix+"provider"] = fmt.Sprintf(
			"spec.type is deprecated for provider values - migrated '%s' to spec.provider",
			originalType,
		)
	}

	return nil
}

// +kubebuilder:webhook:path=/validate-ark-mckinsey-com-v1alpha1-model,mutating=false,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=models,verbs=create;update,versions=v1alpha1,name=vmodel-v1.kb.io,admissionReviewVersions=v1

type ModelValidator struct {
	Client    client.Client
	Resolver  *common.ValueSourceResolver
	Validator *ResourceValidator
}

var _ webhook.CustomValidator = &ModelValidator{}

func (v *ModelValidator) validateValueSource(ctx context.Context, vs *arkv1alpha1.ValueSource, namespace, fieldName string) error {
	if vs == nil {
		return nil
	}

	if vs.ValueFrom == nil {
		return nil
	}

	if vs.ValueFrom.SecretKeyRef != nil {
		if err := v.Validator.ValidateLoadSecretKey(ctx, vs.ValueFrom.SecretKeyRef.Name, namespace, vs.ValueFrom.SecretKeyRef.Key); err != nil {
			return fmt.Errorf("%s: %w", fieldName, err)
		}
	}

	if vs.ValueFrom.ConfigMapKeyRef != nil {
		if err := v.Validator.ValidateLoadConfigMapKey(ctx, vs.ValueFrom.ConfigMapKeyRef.Name, namespace, vs.ValueFrom.ConfigMapKeyRef.Key); err != nil {
			return fmt.Errorf("%s: %w", fieldName, err)
		}
	}

	return nil
}

func (v *ModelValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	model, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		return nil, fmt.Errorf("expected a Model object but got %T", obj)
	}

	modellog.Info("Validating Model", "name", model.GetName(), "namespace", model.GetNamespace())

	// Validate model field ValueSource
	if err := v.validateValueSource(ctx, &model.Spec.Model, model.GetNamespace(), "spec.model"); err != nil {
		return nil, err
	}

	// Validate provider-specific configuration
	if err := v.validateProviderConfig(ctx, model); err != nil {
		return nil, err
	}

	modellog.Info("Model validation complete", "name", model.GetName())

	return collectMigrationWarnings(model.Annotations), nil
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

	_, err := v.Resolver.ResolveValueSource(ctx, model.Spec.Config.Azure.BaseURL, model.GetNamespace())
	if err != nil {
		modellog.Error(err, "Failed to resolve Azure BaseURL", "model", model.GetName())
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

	_, err := v.Resolver.ResolveValueSource(ctx, model.Spec.Config.OpenAI.BaseURL, model.GetNamespace())
	if err != nil {
		modellog.Error(err, "Failed to resolve OpenAI BaseURL", "model", model.GetName())
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

func (v *ModelValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) (admission.Warnings, error) {
	return v.ValidateCreate(ctx, newObj)
}

func (v *ModelValidator) ValidateDelete(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	return nil, nil
}

// collectMigrationWarnings returns admission warnings from migration annotations.
// Mutating webhooks add annotations with annotations.MigrationWarningPrefix to
// record deprecation warnings, which the validating webhook surfaces to users.
func collectMigrationWarnings(resourceAnnotations map[string]string) admission.Warnings {
	var warnings admission.Warnings
	for key, value := range resourceAnnotations {
		if strings.HasPrefix(key, annotations.MigrationWarningPrefix) {
			warnings = append(warnings, value)
		}
	}
	return warnings
}
