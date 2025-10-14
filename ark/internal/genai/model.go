package genai

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

const defaultModelName = "default"

func ResolveModelSpec(modelSpec any, defaultNamespace string) (string, string, error) {
	if modelSpec == nil {
		return "", "", fmt.Errorf("model spec is nil")
	}
	switch spec := modelSpec.(type) {
	case *arkv1alpha1.AgentModelRef:
		modelName := spec.Name
		namespace := spec.Namespace
		if namespace == "" {
			namespace = defaultNamespace
		}
		return modelName, namespace, nil

	case *arkv1alpha1.TeamSelectorSpec:
		modelName := defaultModelName
		if spec.Model != "" {
			modelName = spec.Model
		}
		return modelName, defaultNamespace, nil

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
func LoadModel(ctx context.Context, k8sClient client.Client, modelSpec interface{}, defaultNamespace string) (*Model, error) {
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
		Model: model,
		Type:  modelCRD.Spec.Type,
	}

	switch modelCRD.Spec.Type {
	case ModelTypeAzure:
		if err := loadAzureConfig(ctx, resolver, modelCRD.Spec.Config.Azure, namespace, modelInstance); err != nil {
			return nil, err
		}
	case ModelTypeOpenAI:
		if err := loadOpenAIConfig(ctx, resolver, modelCRD.Spec.Config.OpenAI, namespace, modelInstance); err != nil {
			return nil, err
		}
	case ModelTypeBedrock:
		if err := loadBedrockConfig(ctx, resolver, modelCRD.Spec.Config.Bedrock, namespace, model, modelInstance); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("unsupported model type: %s", modelCRD.Spec.Type)
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
