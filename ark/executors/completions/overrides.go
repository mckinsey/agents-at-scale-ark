package completions

import (
	"context"
	"fmt"
	"maps"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/resolution"
)

type OverrideType string

const (
	OverrideTypeModel     OverrideType = "model"
	OverrideTypeMCPServer OverrideType = "mcpserver"
)

func ResolveHeaders(ctx context.Context, k8sClient client.Client, headers []arkv1alpha1.Header, namespace string) (map[string]string, error) {
	return resolution.ResolveHeadersWith(ctx, k8sClient, headers, namespace, ResolveHeaderValue)
}

func ResolveHeaderValue(ctx context.Context, k8sClient client.Client, header arkv1alpha1.Header, namespace string) (string, error) {
	if header.Value.ValueFrom != nil && header.Value.ValueFrom.QueryParameterRef != nil {
		return resolveQueryParameterRef(ctx, header.Value.ValueFrom.QueryParameterRef)
	}
	return resolution.ResolveHeaderValue(ctx, k8sClient, header, namespace)
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
