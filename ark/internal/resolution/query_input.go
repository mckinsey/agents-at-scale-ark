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
	if queryType == "" {
		queryType = arkv1alpha1.QueryTypeUser
	}

	switch queryType {
	case arkv1alpha1.QueryTypeUser:
		return resolveUserTypeInput(ctx, query, k8sClient)
	case arkv1alpha1.QueryTypeMessages:
		return ExtractFirstUserText(query.Spec.Input.Raw)
	default:
		return "", fmt.Errorf("unknown query input type: %s", queryType)
	}
}

func resolveUserTypeInput(ctx context.Context, query arkv1alpha1.Query, k8sClient client.Client) (string, error) {
	inputString, err := query.Spec.GetInputString()
	if err != nil {
		return "", fmt.Errorf("failed to get input string: %w", err)
	}

	return ResolveQueryInput(ctx, k8sClient, query.Namespace, inputString, query.Spec.Parameters)
}

func ResolveQueryInput(ctx context.Context, k8sClient client.Client, namespace, input string, parameters []arkv1alpha1.Parameter) (string, error) {
	if len(parameters) == 0 {
		return input, nil
	}

	templateData, err := ResolveParameters(ctx, k8sClient, namespace, parameters)
	if err != nil {
		return "", fmt.Errorf("failed to resolve parameters: %w", err)
	}

	resolved, err := common.ResolveTemplate(input, toAnyMap(templateData))
	if err != nil {
		return "", fmt.Errorf("template resolution failed: %w", err)
	}
	return resolved, nil
}

func ResolveParameters(ctx context.Context, k8sClient client.Client, namespace string, parameters []arkv1alpha1.Parameter) (map[string]string, error) {
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

func ExtractFirstUserText(raw []byte) (string, error) {
	if len(raw) == 0 {
		return "", nil
	}

	var messages []json.RawMessage
	if err := json.Unmarshal(raw, &messages); err != nil {
		return "", fmt.Errorf("failed to parse messages array: %w", err)
	}

	for _, msgRaw := range messages {
		text, ok := extractUserTextFromMessage(msgRaw)
		if ok {
			return text, nil
		}
	}

	return "", nil
}

func extractUserTextFromMessage(raw json.RawMessage) (string, bool) {
	var msg struct {
		Role    string          `json:"role"`
		Content json.RawMessage `json:"content"`
	}
	if json.Unmarshal(raw, &msg) != nil {
		return "", false
	}
	if msg.Role != "user" {
		return "", false
	}

	var contentStr string
	if json.Unmarshal(msg.Content, &contentStr) == nil && contentStr != "" {
		return contentStr, true
	}

	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(msg.Content, &parts) == nil {
		for _, p := range parts {
			if p.Type == "text" && p.Text != "" {
				return p.Text, true
			}
		}
	}

	return "", false
}

func toAnyMap(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
