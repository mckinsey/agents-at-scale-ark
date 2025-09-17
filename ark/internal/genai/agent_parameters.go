package genai

import (
	"bytes"
	"context"
	"fmt"
	"text/template"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
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

	tmpl, err := template.New("agent-prompt").Parse(a.Prompt)
	if err != nil {
		return "", fmt.Errorf("invalid template syntax in prompt: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, templateData); err != nil {
		return "", fmt.Errorf("template execution failed: %w", err)
	}

	return buf.String(), nil
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
		configMap := &corev1.ConfigMap{}
		key := types.NamespacedName{Name: valueFrom.ConfigMapKeyRef.Name, Namespace: a.Namespace}
		if err := a.client.Get(ctx, key, configMap); err != nil {
			return "", fmt.Errorf("failed to get ConfigMap %s: %w", valueFrom.ConfigMapKeyRef.Name, err)
		}

		value, exists := configMap.Data[valueFrom.ConfigMapKeyRef.Key]
		if !exists {
			return "", fmt.Errorf("key %s not found in ConfigMap %s", valueFrom.ConfigMapKeyRef.Key, valueFrom.ConfigMapKeyRef.Name)
		}
		return value, nil
	}

	if valueFrom.SecretKeyRef != nil {
		secret := &corev1.Secret{}
		key := types.NamespacedName{Name: valueFrom.SecretKeyRef.Name, Namespace: a.Namespace}
		if err := a.client.Get(ctx, key, secret); err != nil {
			return "", fmt.Errorf("failed to get Secret %s: %w", valueFrom.SecretKeyRef.Name, err)
		}

		value, exists := secret.Data[valueFrom.SecretKeyRef.Key]
		if !exists {
			return "", fmt.Errorf("key %s not found in Secret %s", valueFrom.SecretKeyRef.Key, valueFrom.SecretKeyRef.Name)
		}
		return string(value), nil
	}

	if valueFrom.QueryParameterRef != nil {
		query, ok := ctx.Value("queryContextKey").(*arkv1alpha1.Query)
		if ok && query != nil {
			for _, param := range query.Spec.Parameters {
				if param.Name == valueFrom.QueryParameterRef.Name {
					if param.Value != "" {
						return param.Value, nil
					}
				}
			}
			return "", fmt.Errorf("query parameter %s not found", valueFrom.QueryParameterRef.Name)
		}
		return "", fmt.Errorf("no query context available for parameter %s", valueFrom.QueryParameterRef.Name)
	}

	return "", fmt.Errorf("no supported valueFrom source specified")
}
