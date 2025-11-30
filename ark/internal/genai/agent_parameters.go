package genai

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func (a *Agent) resolvePrompt(ctx context.Context) (string, error) {
	templateData := make(map[string]any)

	agentParams, err := a.resolveParameters(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to resolve parameters: %w", err)
	}
	for name, value := range agentParams {
		templateData[name] = value
	}

	if len(templateData) == 0 {
		return a.Prompt, nil
	}

	resolved, err := common.ResolveTemplate(a.Prompt, templateData)
	if err != nil {
		return "", fmt.Errorf("template resolution failed: %w", err)
	}
	return resolved, nil
}

func (a *Agent) resolveParameters(ctx context.Context) (map[string]string, error) {
	templateData := make(map[string]string)

	for _, param := range a.Parameters {
		if param.Value != "" {
			templateData[param.Name] = param.Value
			continue
		}

		if param.ValueFrom == nil {
			return nil, fmt.Errorf("parameter %s must specify either value or valueFrom", param.Name)
		}

		value, err := a.resolveValueFrom(ctx, param.ValueFrom)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve parameter %s: %w", param.Name, err)
		}
		templateData[param.Name] = value
	}

	return templateData, nil
}

func (a *Agent) resolveValueFrom(ctx context.Context, valueFrom *arkv1alpha1.ValueFromSource) (string, error) {
	if valueFrom.ConfigMapKeyRef != nil {
		return a.resolveConfigMapRef(ctx, valueFrom.ConfigMapKeyRef)
	}

	if valueFrom.SecretKeyRef != nil {
		return a.resolveSecretRef(ctx, valueFrom.SecretKeyRef)
	}

	if valueFrom.QueryParameterRef != nil {
		return a.resolveQueryParameterRef(ctx, valueFrom.QueryParameterRef)
	}

	return "", fmt.Errorf("no supported valueFrom source specified")
}

func (a *Agent) resolveConfigMapRef(ctx context.Context, ref *corev1.ConfigMapKeySelector) (string, error) {
	configMap := &corev1.ConfigMap{}
	key := types.NamespacedName{Name: ref.Name, Namespace: a.Namespace}
	if err := a.client.Get(ctx, key, configMap); err != nil {
		return "", fmt.Errorf("failed to get ConfigMap %s: %w", ref.Name, err)
	}

	value, exists := configMap.Data[ref.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in ConfigMap %s", ref.Key, ref.Name)
	}
	return value, nil
}

func (a *Agent) resolveSecretRef(ctx context.Context, ref *corev1.SecretKeySelector) (string, error) {
	secret := &corev1.Secret{}
	key := types.NamespacedName{Name: ref.Name, Namespace: a.Namespace}
	if err := a.client.Get(ctx, key, secret); err != nil {
		return "", fmt.Errorf("failed to get Secret %s: %w", ref.Name, err)
	}

	value, exists := secret.Data[ref.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in Secret %s", ref.Key, ref.Name)
	}
	return string(value), nil
}

func (a *Agent) resolveQueryParameterRef(ctx context.Context, ref *arkv1alpha1.QueryParameterReference) (string, error) {
	query, ok := ctx.Value(QueryContextKey).(*arkv1alpha1.Query)
	if !ok || query == nil {
		// This is an internal error - agent with queryParameterRef should only be called from queries
		// Log for debugging but don't emit user event
		log := logf.FromContext(ctx)
		log.Error(nil, "Agent with queryParameterRef called without query context",
			"agent", a.GetName(),
			"parameter", ref.Name)
		return "", fmt.Errorf("agent requires query context but none available (parameter: %s)", ref.Name)
	}

	// Look for the parameter in the query
	for _, param := range query.Spec.Parameters {
		if param.Name != ref.Name {
			continue
		}

		// Handle direct value
		if param.Value != "" {
			return param.Value, nil
		}

		// Handle nested valueFrom resolution - query parameter may itself reference ConfigMap/Secret
		// This enables chains like: Agent param -> Query param -> ConfigMap/Secret
		if param.ValueFrom != nil {
			value, err := resolveQueryValueFrom(ctx, a.client, a.Namespace, param.ValueFrom)
			if err != nil {
				return "", fmt.Errorf("failed to resolve query parameter '%s' from its source: %w", param.Name, err)
			}
			return value, nil
		}

		// Parameter found but has neither Value nor ValueFrom
		return "", fmt.Errorf("query parameter '%s' has neither value nor valueFrom", param.Name)
	}

	return "", fmt.Errorf("query parameter '%s' not found in query '%s'", ref.Name, query.Name)
}
