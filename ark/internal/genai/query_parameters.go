package genai

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func ResolveQueryInput(ctx context.Context, k8sClient client.Client, namespace, input string, parameters []arkv1alpha1.Parameter) (string, error) {
	if len(parameters) == 0 {
		return input, nil
	}

	templateData, err := resolveQueryParameters(ctx, k8sClient, namespace, parameters)
	if err != nil {
		return "", fmt.Errorf("failed to resolve parameters: %w", err)
	}

	resolved, err := common.ResolveTemplate(input, toAnyMap(templateData))
	if err != nil {
		return "", fmt.Errorf("template resolution failed: %w", err)
	}
	return resolved, nil
}

func resolveQueryParameters(ctx context.Context, k8sClient client.Client, namespace string, parameters []arkv1alpha1.Parameter) (map[string]string, error) {
	templateData := make(map[string]string)

	for _, param := range parameters {
		if param.Value != "" {
			templateData[param.Name] = param.Value
			continue
		}

		if param.ValueFrom == nil {
			return nil, fmt.Errorf("parameter %s must specify either value or valueFrom", param.Name)
		}

		value, err := resolveQueryValueFrom(ctx, k8sClient, namespace, param.ValueFrom)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve parameter %s: %w", param.Name, err)
		}
		templateData[param.Name] = value
	}

	return templateData, nil
}

func resolveQueryValueFrom(ctx context.Context, k8sClient client.Client, namespace string, valueFrom *arkv1alpha1.ValueFromSource) (string, error) {
	return resolveValueFrom(ctx, k8sClient, namespace, valueFrom)
}

func resolveValueFrom(ctx context.Context, k8sClient client.Client, namespace string, valueFrom *arkv1alpha1.ValueFromSource) (string, error) {
	if valueFrom.ConfigMapKeyRef != nil {
		return resolveConfigMapKeyRef(ctx, k8sClient, namespace, valueFrom.ConfigMapKeyRef)
	}
	if valueFrom.SecretKeyRef != nil {
		return resolveSecretKeyRef(ctx, k8sClient, namespace, valueFrom.SecretKeyRef)
	}
	if valueFrom.QueryParameterRef != nil {
		return resolveQueryParameterRef(ctx, valueFrom.QueryParameterRef)
	}
	return "", fmt.Errorf("no supported valueFrom source specified")
}

func resolveConfigMapKeyRef(ctx context.Context, k8sClient client.Client, namespace string, ref *corev1.ConfigMapKeySelector) (string, error) {
	configMap := &corev1.ConfigMap{}
	key := types.NamespacedName{Name: ref.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, configMap); err != nil {
		return "", fmt.Errorf("failed to get ConfigMap %s: %w", ref.Name, err)
	}
	value, exists := configMap.Data[ref.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in ConfigMap %s", ref.Key, ref.Name)
	}
	return value, nil
}

func resolveSecretKeyRef(ctx context.Context, k8sClient client.Client, namespace string, ref *corev1.SecretKeySelector) (string, error) {
	secret := &corev1.Secret{}
	key := types.NamespacedName{Name: ref.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, secret); err != nil {
		return "", fmt.Errorf("failed to get Secret %s: %w", ref.Name, err)
	}
	value, exists := secret.Data[ref.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in Secret %s", ref.Key, ref.Name)
	}
	return string(value), nil
}

func resolveQueryParameterRef(ctx context.Context, ref *arkv1alpha1.QueryParameterReference) (string, error) {
	query, _ := ctx.Value(QueryContextKey).(*arkv1alpha1.Query)
	if query == nil {
		return "", fmt.Errorf("queryParameterRef requires query context")
	}
	for _, param := range query.Spec.Parameters {
		if param.Name == ref.Name {
			if param.Value != "" {
				return param.Value, nil
			}
			return "", fmt.Errorf("query parameter '%s' has no value", param.Name)
		}
	}
	return "", fmt.Errorf("query parameter '%s' not found", ref.Name)
}

// ResolveBodyTemplate resolves body template with parameters and input data
func ResolveBodyTemplate(ctx context.Context, k8sClient client.Client, namespace, bodyTemplate string, parameters []arkv1alpha1.Parameter, inputData map[string]any) (string, error) {
	if bodyTemplate == "" {
		return "", nil
	}

	templateData := make(map[string]any)

	if inputData != nil {
		templateData["input"] = inputData
	}

	if len(parameters) > 0 {
		paramData, err := resolveQueryParameters(ctx, k8sClient, namespace, parameters)
		if err != nil {
			return "", fmt.Errorf("failed to resolve body parameters: %w", err)
		}

		for key, value := range paramData {
			templateData[key] = value
		}
	}

	resolved, err := common.ResolveTemplate(bodyTemplate, templateData)
	if err != nil {
		return "", fmt.Errorf("body template resolution failed: %w", err)
	}
	return resolved, nil
}

// GetQueryInputMessages returns a message array based on query type, handling both input and messages
func GetQueryInputMessages(ctx context.Context, query arkv1alpha1.Query, k8sClient client.Client) ([]Message, error) {
	queryType := query.Spec.Type
	if queryType == "" {
		queryType = RoleUser // default type
	}

	if queryType == RoleUser {
		// For 'user' type (default), get input string using helper method
		inputString, err := query.Spec.GetInputString()
		if err != nil {
			return nil, fmt.Errorf("failed to get input string: %w", err)
		}

		// Resolve input with template parameters and create a single user message
		resolvedInput, err := ResolveQueryInput(ctx, k8sClient, query.Namespace, inputString, query.Spec.Parameters)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve query input: %w", err)
		}
		return []Message{NewUserMessage(resolvedInput)}, nil
	} else {
		openaiMessages, err := query.Spec.GetInputMessages()
		if err != nil {
			return nil, fmt.Errorf("failed to get input messages: %w", err)
		}

		messages := make([]Message, len(openaiMessages))
		for i := range openaiMessages {
			messages[i] = Message(openaiMessages[i])
		}
		return messages, nil
	}
}

// toAnyMap converts map[string]string to map[string]any
func toAnyMap(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
