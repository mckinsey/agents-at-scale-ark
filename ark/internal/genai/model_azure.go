package genai

import (
	"context"
	"fmt"

	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func loadAzureConfig(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AzureModelConfig, namespace string, model *Model, additionalHeaders map[string]string) error {
	if config == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}

	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve Azure baseURL: %w", err)
	}

	var apiKey string
	var managedIdentity *AzureManagedIdentityConfig
	var workloadIdentity *AzureWorkloadIdentityConfig

	if config.Auth != nil {
		authMethodCount := 0
		if config.Auth.APIKey != nil {
			authMethodCount++
		}
		if config.Auth.ManagedIdentity != nil {
			authMethodCount++
		}
		if config.Auth.WorkloadIdentity != nil {
			authMethodCount++
		}
		if authMethodCount != 1 {
			return fmt.Errorf("exactly one authentication method must be specified in auth (apiKey, managedIdentity, or workloadIdentity)")
		}

		if config.Auth.APIKey != nil {
			apiKey, err = resolver.ResolveValueSource(ctx, *config.Auth.APIKey, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve Azure apiKey: %w", err)
			}
		} else if config.Auth.ManagedIdentity != nil {
			managedIdentity = &AzureManagedIdentityConfig{}
			if config.Auth.ManagedIdentity.ClientID != nil {
				clientID, err := resolver.ResolveValueSource(ctx, *config.Auth.ManagedIdentity.ClientID, namespace)
				if err != nil {
					return fmt.Errorf("failed to resolve managed identity clientID: %w", err)
				}
				managedIdentity.ClientID = clientID
			}
		} else if config.Auth.WorkloadIdentity != nil {
			clientID, err := resolver.ResolveValueSource(ctx, config.Auth.WorkloadIdentity.ClientID, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve workload identity clientID: %w", err)
			}
			tenantID, err := resolver.ResolveValueSource(ctx, config.Auth.WorkloadIdentity.TenantID, namespace)
			if err != nil {
				return fmt.Errorf("failed to resolve workload identity tenantID: %w", err)
			}
			workloadIdentity = &AzureWorkloadIdentityConfig{
				ClientID: clientID,
				TenantID: tenantID,
			}
		}
	} else {
		log := logf.FromContext(ctx)
		log.Info("DEPRECATION WARNING: spec.config.azure.apiKey is deprecated, use spec.config.azure.auth.apiKey instead")
		apiKey, err = resolver.ResolveValueSource(ctx, config.APIKey, namespace)
		if err != nil {
			return fmt.Errorf("failed to resolve Azure apiKey: %w", err)
		}
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
		APIKey:           apiKey,
		APIVersion:       apiVersion,
		ManagedIdentity:  managedIdentity,
		WorkloadIdentity: workloadIdentity,
		Headers:          headers,
		Properties:       properties,
	}
	model.Provider = azureProvider
	model.Properties = properties

	return nil
}
