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
	queryType := query.Spec.Type
	if queryType == "" || queryType == arkv1alpha1.QueryTypeUser {
		return resolveUserInput(ctx, query, k8sClient)
	}
	if queryType == arkv1alpha1.QueryTypeMessages {
		return extractFirstUserText(query.Spec.Input.Raw)
	}
	return "", fmt.Errorf("unsupported query type: %s", queryType)
}

func resolveUserInput(ctx context.Context, query arkv1alpha1.Query, k8sClient client.Client) (string, error) {
	inputString, err := query.Spec.GetInputString()
	if err != nil {
		return "", fmt.Errorf("failed to get input string: %w", err)
	}

	if len(query.Spec.Parameters) == 0 {
		return inputString, nil
	}

	templateData, err := resolveQueryParameters(ctx, k8sClient, query.Namespace, query.Spec.Parameters)
	if err != nil {
		return "", fmt.Errorf("failed to resolve parameters: %w", err)
	}

	resolved, err := common.ResolveTemplate(inputString, toAnyMap(templateData))
	if err != nil {
		return "", fmt.Errorf("template resolution failed: %w", err)
	}
	return resolved, nil
}

func extractFirstUserText(raw []byte) (string, error) {
	var messages []json.RawMessage
	if err := json.Unmarshal(raw, &messages); err != nil {
		return "", fmt.Errorf("failed to unmarshal input messages: %w", err)
	}

	for _, msgRaw := range messages {
		var msg struct {
			Role    string `json:"role"`
			Content any    `json:"content"`
		}
		if err := json.Unmarshal(msgRaw, &msg); err != nil {
			continue
		}
		if msg.Role != "user" {
			continue
		}
		switch c := msg.Content.(type) {
		case string:
			if c != "" {
				return c, nil
			}
		}
	}
	return "", nil
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
		value, err := resolveParameterValueFrom(ctx, k8sClient, namespace, param.ValueFrom)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve parameter %s: %w", param.Name, err)
		}
		templateData[param.Name] = value
	}
	return templateData, nil
}

func resolveParameterValueFrom(ctx context.Context, k8sClient client.Client, namespace string, valueFrom *arkv1alpha1.ValueFromSource) (string, error) {
	if valueFrom.ConfigMapKeyRef != nil {
		return ResolveFromConfigMap(ctx, k8sClient, valueFrom.ConfigMapKeyRef, namespace)
	}
	if valueFrom.SecretKeyRef != nil {
		return ResolveFromSecret(ctx, k8sClient, valueFrom.SecretKeyRef, namespace)
	}
	return "", fmt.Errorf("no supported valueFrom source specified")
}

func toAnyMap(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
