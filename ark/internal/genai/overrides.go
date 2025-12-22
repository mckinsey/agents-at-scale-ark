package genai

import (
	"context"
	"fmt"
	"maps"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

type OverrideType string

const (
	OverrideTypeModel     OverrideType = "model"
	OverrideTypeMCPServer OverrideType = "mcpserver"
)

func ResolveHeaders(ctx context.Context, k8sClient client.Client, headers []arkv1alpha1.Header, namespace string) (map[string]string, error) {
	resolvedHeaders := make(map[string]string)
	for _, header := range headers {
		value, err := ResolveHeaderValue(ctx, k8sClient, header, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve header %s: %w", header.Name, err)
		}
		resolvedHeaders[header.Name] = value
	}

	return resolvedHeaders, nil
}

func ResolveHeaderValue(ctx context.Context, k8sClient client.Client, header arkv1alpha1.Header, namespace string) (string, error) {
	if header.Value.Value != "" {
		return header.Value.Value, nil
	}

	if header.Value.ValueFrom == nil {
		return "", fmt.Errorf("header value must specify either value or valueFrom")
	}

	if header.Value.ValueFrom.SecretKeyRef != nil {
		return resolveHeaderFromSecret(ctx, k8sClient, header.Value.ValueFrom.SecretKeyRef, namespace)
	}

	if header.Value.ValueFrom.ConfigMapKeyRef != nil {
		return resolveHeaderFromConfigMap(ctx, k8sClient, header.Value.ValueFrom.ConfigMapKeyRef, namespace)
	}

	if header.Value.ValueFrom.QueryParameterRef != nil {
		return resolveQueryParameterRef(ctx, header.Value.ValueFrom.QueryParameterRef)
	}

	return "", fmt.Errorf("header value must specify either value or valueFrom with a valid source")
}

func resolveHeaderFromSecret(ctx context.Context, k8sClient client.Client, secretRef *corev1.SecretKeySelector, namespace string) (string, error) {
	secret := &corev1.Secret{}
	secretKey := types.NamespacedName{
		Name:      secretRef.Name,
		Namespace: namespace,
	}

	if err := k8sClient.Get(ctx, secretKey, secret); err != nil {
		return "", fmt.Errorf("failed to get secret %s/%s: %w", namespace, secretRef.Name, err)
	}

	value, exists := secret.Data[secretRef.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in secret %s/%s", secretRef.Key, namespace, secretRef.Name)
	}

	return string(value), nil
}

func resolveHeaderFromConfigMap(ctx context.Context, k8sClient client.Client, configMapRef *corev1.ConfigMapKeySelector, namespace string) (string, error) {
	configMap := &corev1.ConfigMap{}
	configMapKey := types.NamespacedName{
		Name:      configMapRef.Name,
		Namespace: namespace,
	}

	if err := k8sClient.Get(ctx, configMapKey, configMap); err != nil {
		return "", fmt.Errorf("failed to get configMap %s/%s: %w", namespace, configMapRef.Name, err)
	}

	value, exists := configMap.Data[configMapRef.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in configMap %s/%s", configMapRef.Key, namespace, configMapRef.Name)
	}

	return value, nil
}

func ResolveHeaderValueV1PreAlpha1(ctx context.Context, k8sClient client.Client, header arkv1prealpha1.Header, namespace string) (string, error) {
	v1alpha1Header := arkv1alpha1.Header{
		Name:  header.Name,
		Value: header.Value,
	}
	return ResolveHeaderValue(ctx, k8sClient, v1alpha1Header, namespace)
}

func listResourcesByLabels(ctx context.Context, k8sClient client.Client, namespace string, overrideType OverrideType, labelSelector *metav1.LabelSelector) ([]client.Object, error) {
	listOpts := &client.ListOptions{
		Namespace: namespace,
	}

	if labelSelector != nil {
		selector, err := metav1.LabelSelectorAsSelector(labelSelector)
		if err != nil {
			return nil, fmt.Errorf("invalid labelSelector: %w", err)
		}
		listOpts.LabelSelector = selector
	}

	var resources []client.Object

	switch overrideType {
	case OverrideTypeModel:
		var modelList arkv1alpha1.ModelList
		if err := k8sClient.List(ctx, &modelList, listOpts); err != nil {
			return nil, fmt.Errorf("failed to list models: %w", err)
		}
		for i := range modelList.Items {
			resources = append(resources, &modelList.Items[i])
		}

	case OverrideTypeMCPServer:
		var mcpServerList arkv1alpha1.MCPServerList
		if err := k8sClient.List(ctx, &mcpServerList, listOpts); err != nil {
			return nil, fmt.Errorf("failed to list MCP servers: %w", err)
		}
		for i := range mcpServerList.Items {
			resources = append(resources, &mcpServerList.Items[i])
		}

	default:
		return nil, fmt.Errorf("unsupported overrideType: %s", overrideType)
	}

	return resources, nil
}

func ResolveHeadersFromOverrides(ctx context.Context, k8sClient client.Client, overrides []arkv1alpha1.Override, namespace string, overrideType OverrideType) (map[string]map[string]string, error) {
	resourceHeaders := make(map[string]map[string]string)

	for _, override := range overrides {
		if override.ResourceType != string(overrideType) {
			continue
		}

		resolvedHeaders, err := ResolveHeaders(ctx, k8sClient, override.Headers, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve headers for overrideType %s: %w", overrideType, err)
		}

		if len(resolvedHeaders) == 0 {
			continue
		}

		resources, err := listResourcesByLabels(ctx, k8sClient, namespace, overrideType, override.LabelSelector)
		if err != nil {
			return nil, err
		}

		for _, resource := range resources {
			resourceName := resource.GetName()
			if resourceHeaders[resourceName] == nil {
				resourceHeaders[resourceName] = make(map[string]string)
			}
			maps.Copy(resourceHeaders[resourceName], resolvedHeaders)
		}
	}

	return resourceHeaders, nil
}
