package completions

import (
	"context"
	"fmt"
	"maps"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
	"mckinsey.com/ark/internal/resolution"
	"mckinsey.com/ark/internal/secretscope"
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
	return resolveHeaderValueWithAccess(ctx, k8sClient, header, namespace, secretscope.RejectPersonal)
}

func resolveHeaderValueWithAccess(ctx context.Context, k8sClient client.Client, header arkv1alpha1.Header, namespace string, access secretscope.Access) (string, error) {
	if header.Value.ValueFrom != nil && header.Value.ValueFrom.QueryParameterRef != nil {
		return resolveQueryParameterRef(ctx, header.Value.ValueFrom.QueryParameterRef)
	}
	return resolution.ResolveHeaderValueWithAccess(ctx, k8sClient, header, namespace, access)
}

func overrideHeaderResolver(overrideType OverrideType, access secretscope.Access) resolution.HeaderResolver {
	if overrideType != OverrideTypeMCPServer {
		access = secretscope.RejectPersonal
	}
	return func(ctx context.Context, k8sClient client.Client, header arkv1alpha1.Header, namespace string) (string, error) {
		return resolveHeaderValueWithAccess(ctx, k8sClient, header, namespace, access)
	}
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

func overrideUsesPersonalSecret(ctx context.Context, k8sClient client.Client, override arkv1alpha1.Override, namespace string) (bool, error) {
	for _, header := range override.Headers {
		source := header.Value.ValueFrom
		if source == nil || source.SecretKeyRef == nil {
			continue
		}
		var secret corev1.Secret
		key := types.NamespacedName{Namespace: namespace, Name: source.SecretKeyRef.Name}
		if err := k8sClient.Get(ctx, key, &secret); err != nil {
			if apierrors.IsNotFound(err) {
				continue
			}
			return false, fmt.Errorf("failed to read secret %s: %w", key, err)
		}
		if secretscope.IsPersonal(secret.GetLabels()) {
			return true, nil
		}
	}
	return false, nil
}

func personalSecretTarget(selector *metav1.LabelSelector) (string, error) {
	if selector == nil || len(selector.MatchExpressions) > 0 || len(selector.MatchLabels) != 1 {
		return "", secretscope.ErrPersonalSecretSelector
	}
	name := selector.MatchLabels[labels.NameLabel]
	if name == "" {
		return "", secretscope.ErrPersonalSecretSelector
	}
	return name, nil
}

func onlyNamed(resources []client.Object, name string) []client.Object {
	var named []client.Object
	for _, resource := range resources {
		if resource.GetName() == name {
			named = append(named, resource)
		}
	}
	return named
}

func personalOverrideAccess(ctx context.Context, k8sClient client.Client, override arkv1alpha1.Override, namespace string, overrideType OverrideType, access secretscope.Access) (secretscope.Access, bool, error) {
	if overrideType != OverrideTypeMCPServer || access != secretscope.AllowPersonal {
		return secretscope.RejectPersonal, false, nil
	}
	personal, err := overrideUsesPersonalSecret(ctx, k8sClient, override, namespace)
	if err != nil || !personal {
		return secretscope.RejectPersonal, false, err
	}
	return secretscope.AllowPersonal, true, nil
}

func restrictToNamedServer(override arkv1alpha1.Override, resources []client.Object) ([]client.Object, error) {
	target, err := personalSecretTarget(override.LabelSelector)
	if err != nil {
		return nil, err
	}
	named := onlyNamed(resources, target)
	if len(named) == 0 {
		return nil, fmt.Errorf("no MCPServer named %s carries the %s label", target, labels.NameLabel)
	}
	return named, nil
}

func resolveOverride(ctx context.Context, k8sClient client.Client, override arkv1alpha1.Override, namespace string, overrideType OverrideType, access secretscope.Access) (map[string]string, []client.Object, error) {
	overrideAccess, personal, err := personalOverrideAccess(ctx, k8sClient, override, namespace, overrideType, access)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to resolve headers for overrideType %s: %w", overrideType, err)
	}

	resolvedHeaders, err := resolution.ResolveHeadersWith(ctx, k8sClient, override.Headers, namespace, overrideHeaderResolver(overrideType, overrideAccess))
	if err != nil {
		return nil, nil, fmt.Errorf("failed to resolve headers for overrideType %s: %w", overrideType, err)
	}
	if len(resolvedHeaders) == 0 {
		return nil, nil, nil
	}

	resources, err := listResourcesByLabels(ctx, k8sClient, namespace, overrideType, override.LabelSelector)
	if err != nil {
		return nil, nil, err
	}
	if personal {
		resources, err = restrictToNamedServer(override, resources)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to resolve headers for overrideType %s: %w", overrideType, err)
		}
	}
	return resolvedHeaders, resources, nil
}

func ResolveHeadersFromOverrides(ctx context.Context, k8sClient client.Client, overrides []arkv1alpha1.Override, namespace string, overrideType OverrideType, access secretscope.Access) (map[string]map[string]string, error) {
	resourceHeaders := make(map[string]map[string]string)

	for _, override := range overrides {
		if override.ResourceType != string(overrideType) {
			continue
		}

		resolvedHeaders, resources, err := resolveOverride(ctx, k8sClient, override, namespace, overrideType, access)
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
