package resolution

import (
	"context"
	"encoding/json"
	"fmt"

	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func ResolveQueryInputText(ctx context.Context, query arkv1alpha1.Query, k8sClient client.Client) (string, error) {
	inputString, err := query.Spec.GetInputString()
	if err != nil {
		return "", fmt.Errorf("failed to get input string: %w", err)
	}

	if len(query.Spec.Parameters) == 0 {
		return inputString, nil
	}

	templateData, err := resolveParameters(ctx, k8sClient, query.Namespace, query.Spec.Parameters)
	if err != nil {
		return "", fmt.Errorf("failed to resolve parameters: %w", err)
	}

	resolved, err := common.ResolveTemplate(inputString, templateData)
	if err != nil {
		return "", fmt.Errorf("template resolution failed: %w", err)
	}
	return resolved, nil
}

func resolveParameters(ctx context.Context, k8sClient client.Client, namespace string, parameters []arkv1alpha1.Parameter) (map[string]any, error) {
	data := make(map[string]any, len(parameters))
	for _, param := range parameters {
		if param.Value != "" {
			data[param.Name] = param.Value
			continue
		}
		if param.ValueFrom == nil {
			return nil, fmt.Errorf("parameter %s must specify either value or valueFrom", param.Name)
		}
		value, err := resolveValueFrom(ctx, k8sClient, namespace, param.ValueFrom)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve parameter %s: %w", param.Name, err)
		}
		data[param.Name] = value
	}
	return data, nil
}

func resolveValueFrom(ctx context.Context, k8sClient client.Client, namespace string, valueFrom *arkv1alpha1.ValueFromSource) (string, error) {
	if valueFrom.ConfigMapKeyRef != nil {
		return ResolveFromConfigMap(ctx, k8sClient, valueFrom.ConfigMapKeyRef, namespace)
	}
	if valueFrom.SecretKeyRef != nil {
		return ResolveFromSecret(ctx, k8sClient, valueFrom.SecretKeyRef, namespace)
	}
	return "", fmt.Errorf("no supported valueFrom source specified")
}

func ExtractFirstUserText(raw json.RawMessage) (string, error) {
	var messages []struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	}
	if err := json.Unmarshal(raw, &messages); err != nil {
		return "", fmt.Errorf("failed to parse messages array: %w", err)
	}

	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		var text string
		if err := json.Unmarshal(messages[i].Content, &text); err == nil {
			return text, nil
		}
		var parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(messages[i].Content, &parts); err == nil {
			for _, p := range parts {
				if p.Type == "text" {
					return p.Text, nil
				}
			}
		}
		return "", fmt.Errorf("could not extract text from user message content")
	}
	return "", fmt.Errorf("no user message found in messages array")
}
