package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go/option"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

const defaultModelName = "default"

func ResolveModelSpec(modelSpec any, defaultNamespace string) (string, string, error) {
	if modelSpec == nil {
		return "", "", fmt.Errorf("model spec is nil")
	}
	switch spec := modelSpec.(type) {
	case *arkv1alpha1.AgentModelRef:
		if spec == nil {
			return "", "", fmt.Errorf("AgentModelRef pointer is nil")
		}
		modelName := spec.Name
		namespace := spec.Namespace
		if namespace == "" {
			namespace = defaultNamespace
		}
		return modelName, namespace, nil

	case string:
		modelName := spec
		if modelName == "" {
			modelName = defaultModelName
		}
		return modelName, defaultNamespace, nil

	default:
		return "", "", fmt.Errorf("unsupported model spec type: %T", modelSpec)
	}
}

// LoadModel loads a model by resolving modelSpec and defaultNamespace
func LoadModel(ctx context.Context, k8sClient client.Client, modelSpec interface{}, defaultNamespace string, additionalHeaders map[string]string, telemetryRecorder telemetry.ModelRecorder, eventingRecorder eventing.ModelRecorder) (*Model, error) {
	modelName, namespace, err := ResolveModelSpec(modelSpec, defaultNamespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve model spec: %w", err)
	}
	modelCRD, err := loadModelCRD(ctx, k8sClient, modelName, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to load model CRD %s in namespace %s: %w", modelName, namespace, err)
	}

	resolver := common.NewValueSourceResolver(k8sClient)
	model, err := resolver.ResolveValueSource(ctx, modelCRD.Spec.Model, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve model: %w", err)
	}

	modelInstance := &Model{
		Model:             model,
		Type:              modelCRD.Spec.Type,
		telemetryRecorder: telemetryRecorder,
		eventingRecorder:  eventingRecorder,
	}

	switch modelCRD.Spec.Provider {
	case ProviderAzure:
		if err := loadAzureConfig(ctx, resolver, modelCRD.Spec.Config.Azure, namespace, modelInstance, additionalHeaders); err != nil {
			return nil, err
		}
	case ProviderOpenAI:
		if err := loadOpenAIConfig(ctx, resolver, modelCRD.Spec.Config.OpenAI, namespace, modelInstance, additionalHeaders); err != nil {
			return nil, err
		}
	case ProviderBedrock:
		if err := loadBedrockConfig(ctx, resolver, modelCRD.Spec.Config.Bedrock, namespace, model, modelInstance); err != nil {
			return nil, err
		}
	default:
		if modelCRD.Spec.Provider == "" {
			if IsDeprecatedProviderInType(modelCRD.Spec.Type) {
				return nil, fmt.Errorf("provider is required - update model to migrate '%s' from spec.type to spec.provider", modelCRD.Spec.Type)
			}
			return nil, fmt.Errorf("provider is required")
		}
		return nil, fmt.Errorf("unsupported provider: %s", modelCRD.Spec.Provider)
	}

	return modelInstance, nil
}

func loadModelCRD(ctx context.Context, k8sClient client.Client, name, namespace string) (*arkv1alpha1.Model, error) {
	var modelCRD arkv1alpha1.Model
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := k8sClient.Get(ctx, key, &modelCRD); err != nil {
		return nil, fmt.Errorf("failed to get Model %s/%s: %w", namespace, name, err)
	}

	return &modelCRD, nil
}

func resolveModelHeaders(ctx context.Context, k8sClient client.Client, headers []arkv1alpha1.Header, namespace string) (map[string]string, error) {
	return ResolveHeaders(ctx, k8sClient, headers, namespace)
}

// applyHeadersToOptions applies custom headers to OpenAI client options
func applyHeadersToOptions(ctx context.Context, headers map[string]string, options []option.RequestOption, modelName string) []option.RequestOption {
	if len(headers) == 0 {
		return options
	}

	log := logf.FromContext(ctx)
	log.Info("applying custom headers to client", "model", modelName, "header_count", len(headers))
	for name, value := range headers {
		log.V(1).Info("applying custom header", "model", modelName, "header_name", name, "header_value_length", len(value))
		options = append(options, option.WithHeader(name, value))
	}

	return options
}
