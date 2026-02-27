package genai

import (
	"context"
	"fmt"

	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

type azureAuthResult struct {
	apiKey           string
	managedIdentity  *AzureManagedIdentityConfig
	workloadIdentity *AzureWorkloadIdentityConfig
}

func resolveAzureAuthDeprecated(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AzureModelConfig, namespace string) (*azureAuthResult, error) {
	if config.APIKey == nil {
		return nil, fmt.Errorf("spec.config.azure.apiKey or spec.config.azure.auth is required")
	}
	logf.FromContext(ctx).Info("DEPRECATION WARNING: spec.config.azure.apiKey is deprecated, use spec.config.azure.auth.apiKey instead")
	apiKey, err := resolver.ResolveValueSource(ctx, *config.APIKey, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve Azure apiKey: %w", err)
	}
	return &azureAuthResult{apiKey: apiKey}, nil
}

func resolveAzureAuthFromAuth(ctx context.Context, resolver *common.ValueSourceResolver, auth *arkv1alpha1.AzureAuth, namespace string) (*azureAuthResult, error) {
	n := 0
	if auth.APIKey != nil {
		n++
	}
	if auth.ManagedIdentity != nil {
		n++
	}
	if auth.WorkloadIdentity != nil {
		n++
	}
	if n != 1 {
		return nil, fmt.Errorf("exactly one authentication method must be specified in auth (apiKey, managedIdentity, or workloadIdentity)")
	}
	result := &azureAuthResult{}
	switch {
	case auth.APIKey != nil:
		apiKey, err := resolver.ResolveValueSource(ctx, *auth.APIKey, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Azure apiKey: %w", err)
		}
		result.apiKey = apiKey
	case auth.ManagedIdentity != nil:
		result.managedIdentity = &AzureManagedIdentityConfig{}
		if auth.ManagedIdentity.ClientID != nil {
			clientID, err := resolver.ResolveValueSource(ctx, *auth.ManagedIdentity.ClientID, namespace)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve managed identity clientID: %w", err)
			}
			result.managedIdentity.ClientID = clientID
		}
	case auth.WorkloadIdentity != nil:
		clientID, err := resolver.ResolveValueSource(ctx, auth.WorkloadIdentity.ClientID, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve workload identity clientID: %w", err)
		}
		tenantID, err := resolver.ResolveValueSource(ctx, auth.WorkloadIdentity.TenantID, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve workload identity tenantID: %w", err)
		}
		result.workloadIdentity = &AzureWorkloadIdentityConfig{
			ClientID: clientID,
			TenantID: tenantID,
		}
	}
	return result, nil
}

func resolveAzureAuth(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AzureModelConfig, namespace string) (*azureAuthResult, error) {
	if config.Auth == nil {
		return resolveAzureAuthDeprecated(ctx, resolver, config, namespace)
	}
	return resolveAzureAuthFromAuth(ctx, resolver, config.Auth, namespace)
}

func loadAzureConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AzureModelConfig, namespace string, model *Model, additionalHeaders map[string]string) error {
	if config == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}

	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Azure baseURL: %w", err)
	}

	authResult, err := resolveAzureAuth(ctx, resolver, config, namespace)
	if err != nil {
		return err
	}

	var apiVersion string
	if config.APIVersion != nil {
		apiVersion, err = resolver.ResolveValueSource(ctx, *config.APIVersion, namespace)
		if err != nil {
			return fmt.Errorf("failed to resolve Azure apiVersion: %w", err)
		}
	}

	headers, err := resolveModelHeaders(ctx, resolver.Client, config.Headers, namespace)
	if err != nil {
		return err
	}

	for k, v := range additionalHeaders {
		headers[k] = v
	}

	var properties map[string]string
	if config.Properties != nil {
		properties = make(map[string]string)
		for key, valueSource := range config.Properties {
			value, err := resolver.ResolveValueSource(ctx, valueSource, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve Azure property %s: %w", key, err)
			}
			properties[key] = value
		}
	}

	azureProvider := &AzureProvider{
		Model:            model.Model,
		BaseURL:          baseURL,
		APIKey:           authResult.apiKey,
		APIVersion:       apiVersion,
		ManagedIdentity:  authResult.managedIdentity,
		WorkloadIdentity: authResult.workloadIdentity,
		Headers:          headers,
		Properties:       properties,
	}
	model.Provider = azureProvider
	model.Properties = properties

	return nil
}
