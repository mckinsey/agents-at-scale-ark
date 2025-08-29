package genai

import (
	"bytes"
	"context"
	"fmt"
	"text/template"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func ResolveQueryInput(ctx context.Context, k8sClient client.Client, namespace, input string, parameters []arkv1alpha1.Parameter) (string, error) {
	if len(parameters) == 0 {
		return input, nil
	}

	templateData, err := resolveQueryParameters(ctx, k8sClient, namespace, parameters)
	if err != nil {
		return "", fmt.Errorf("failed to resolve parameters: %w", err)
	}

	tmpl, err := template.New("query-input").Parse(input)
	if err != nil {
		return "", fmt.Errorf("invalid template syntax in input: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, templateData); err != nil {
		return "", fmt.Errorf("template execution failed: %w", err)
	}

	return buf.String(), nil
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
	if valueFrom.ConfigMapKeyRef != nil {
		configMap := &corev1.ConfigMap{}
		key := types.NamespacedName{Name: valueFrom.ConfigMapKeyRef.Name, Namespace: namespace}
		if err := k8sClient.Get(ctx, key, configMap); err != nil {
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
		key := types.NamespacedName{Name: valueFrom.SecretKeyRef.Name, Namespace: namespace}
		if err := k8sClient.Get(ctx, key, secret); err != nil {
			return "", fmt.Errorf("failed to get Secret %s: %w", valueFrom.SecretKeyRef.Name, err)
		}

		value, exists := secret.Data[valueFrom.SecretKeyRef.Key]
		if !exists {
			return "", fmt.Errorf("key %s not found in Secret %s", valueFrom.SecretKeyRef.Key, valueFrom.SecretKeyRef.Name)
		}
		return string(value), nil
	}

	return "", fmt.Errorf("no supported valueFrom source specified")
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

	tmpl, err := template.New("body-template").Parse(bodyTemplate)
	if err != nil {
		return "", fmt.Errorf("invalid template syntax in body: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, templateData); err != nil {
		return "", fmt.Errorf("body template execution failed: %w", err)
	}

	return buf.String(), nil
}

// ResolveBodyTemplateWithEventEmission resolves body template with error event emission
func ResolveBodyTemplateWithEventEmission(ctx context.Context, k8sClient client.Client, namespace, bodyTemplate string, parameters []arkv1alpha1.Parameter, inputData map[string]any, eventEmitter EventEmitter) (string, error) {
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
			// Emit error event for parameter resolution failures
			if eventEmitter != nil {
				event := BaseEvent{
					Name: "BodyParameterResolution",
					Metadata: map[string]string{
						"error":     err.Error(),
						"namespace": namespace,
						"cause":     "parameter_resolution_failed",
					},
				}
				eventEmitter.EmitEvent(ctx, "BodyParameterResolutionError", event)
			}
			return "", fmt.Errorf("failed to resolve body parameters: %w", err)
		}

		for key, value := range paramData {
			templateData[key] = value
		}
	}

	tmpl, err := template.New("body-template").Parse(bodyTemplate)
	if err != nil {
		// Emit error event for template syntax errors
		if eventEmitter != nil {
			event := BaseEvent{
				Name: "BodyTemplateParsing",
				Metadata: map[string]string{
					"error":    err.Error(),
					"template": bodyTemplate,
					"cause":    "invalid_template_syntax",
				},
			}
			eventEmitter.EmitEvent(ctx, "BodyTemplateSyntaxError", event)
		}
		return "", fmt.Errorf("invalid template syntax in body: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, templateData); err != nil {
		// Emit error event for template execution errors
		if eventEmitter != nil {
			event := BaseEvent{
				Name: "BodyTemplateExecution",
				Metadata: map[string]string{
					"error":    err.Error(),
					"template": bodyTemplate,
					"cause":    "template_execution_failed",
				},
			}
			eventEmitter.EmitEvent(ctx, "BodyTemplateExecutionError", event)
		}
		return "", fmt.Errorf("body template execution failed: %w", err)
	}

	return buf.String(), nil
}
