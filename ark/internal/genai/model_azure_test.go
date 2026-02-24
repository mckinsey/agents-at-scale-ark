package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func setupAzureTestClient(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)
	return fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).Build()
}

func TestLoadAzureConfig_AuthWithAPIKey(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "azure-secret", Namespace: "default"},
		Data:       map[string][]byte{"api-key": []byte("test-api-key")},
	}
	fakeClient := setupAzureTestClient([]client.Object{secret})
	resolver := common.NewValueSourceResolver(fakeClient)
	ctx := context.Background()

	config := &arkv1alpha1.AzureModelConfig{
		BaseURL: arkv1alpha1.ValueSource{Value: "https://api.azure.com"},
		Auth: &arkv1alpha1.AzureAuth{
			APIKey: &arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "azure-secret"},
						Key:                  "api-key",
					},
				},
			},
		},
	}

	model := &Model{}
	err := loadAzureConfig(ctx, resolver, config, "default", model, nil)

	require.NoError(t, err)
	require.NotNil(t, model.Provider)
	azureProvider, ok := model.Provider.(*AzureProvider)
	require.True(t, ok)
	require.Equal(t, "test-api-key", azureProvider.APIKey)
}

func TestLoadAzureConfig_LegacyAPIKey_FallbackWithWarning(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "azure-secret", Namespace: "default"},
		Data:       map[string][]byte{"api-key": []byte("legacy-api-key")},
	}
	fakeClient := setupAzureTestClient([]client.Object{secret})
	resolver := common.NewValueSourceResolver(fakeClient)
	ctx := context.Background()

	config := &arkv1alpha1.AzureModelConfig{
		BaseURL: arkv1alpha1.ValueSource{Value: "https://api.azure.com"},
		APIKey: &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "azure-secret"},
					Key:                  "api-key",
				},
			},
		},
	}

	model := &Model{}
	err := loadAzureConfig(ctx, resolver, config, "default", model, nil)

	require.NoError(t, err)
	require.NotNil(t, model.Provider)
	azureProvider, ok := model.Provider.(*AzureProvider)
	require.True(t, ok)
	require.Equal(t, "legacy-api-key", azureProvider.APIKey)
}

func TestLoadAzureConfig_ManagedIdentity_NoClientID(t *testing.T) {
	fakeClient := setupAzureTestClient(nil)
	resolver := common.NewValueSourceResolver(fakeClient)
	ctx := context.Background()

	config := &arkv1alpha1.AzureModelConfig{
		BaseURL: arkv1alpha1.ValueSource{Value: "https://api.azure.com"},
		Auth: &arkv1alpha1.AzureAuth{
			ManagedIdentity: &arkv1alpha1.AzureManagedIdentity{},
		},
	}

	model := &Model{}
	err := loadAzureConfig(ctx, resolver, config, "default", model, nil)

	require.NoError(t, err)
	require.NotNil(t, model.Provider)
	azureProvider, ok := model.Provider.(*AzureProvider)
	require.True(t, ok)
	require.Empty(t, azureProvider.APIKey)
	require.NotNil(t, azureProvider.ManagedIdentity)
	require.Empty(t, azureProvider.ManagedIdentity.ClientID)
}

func TestLoadAzureConfig_ManagedIdentity_WithClientID(t *testing.T) {
	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "identity-config", Namespace: "default"},
		Data:       map[string]string{"client-id": "my-client-id-123"},
	}
	fakeClient := setupAzureTestClient([]client.Object{configMap})
	resolver := common.NewValueSourceResolver(fakeClient)
	ctx := context.Background()

	config := &arkv1alpha1.AzureModelConfig{
		BaseURL: arkv1alpha1.ValueSource{Value: "https://api.azure.com"},
		Auth: &arkv1alpha1.AzureAuth{
			ManagedIdentity: &arkv1alpha1.AzureManagedIdentity{
				ClientID: &arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "identity-config"},
							Key:                  "client-id",
						},
					},
				},
			},
		},
	}

	model := &Model{}
	err := loadAzureConfig(ctx, resolver, config, "default", model, nil)

	require.NoError(t, err)
	require.NotNil(t, model.Provider)
	azureProvider, ok := model.Provider.(*AzureProvider)
	require.True(t, ok)
	require.Empty(t, azureProvider.APIKey)
	require.NotNil(t, azureProvider.ManagedIdentity)
	require.Equal(t, "my-client-id-123", azureProvider.ManagedIdentity.ClientID)
}

func TestLoadAzureConfig_WorkloadIdentity(t *testing.T) {
	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "wi-config", Namespace: "default"},
		Data:       map[string]string{"client-id": "wi-client-id", "tenant-id": "wi-tenant-id"},
	}
	fakeClient := setupAzureTestClient([]client.Object{configMap})
	resolver := common.NewValueSourceResolver(fakeClient)
	ctx := context.Background()

	config := &arkv1alpha1.AzureModelConfig{
		BaseURL: arkv1alpha1.ValueSource{Value: "https://api.azure.com"},
		Auth: &arkv1alpha1.AzureAuth{
			WorkloadIdentity: &arkv1alpha1.AzureWorkloadIdentity{
				ClientID: arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "wi-config"},
							Key:                  "client-id",
						},
					},
				},
				TenantID: arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "wi-config"},
							Key:                  "tenant-id",
						},
					},
				},
			},
		},
	}

	model := &Model{}
	err := loadAzureConfig(ctx, resolver, config, "default", model, nil)

	require.NoError(t, err)
	require.NotNil(t, model.Provider)
	azureProvider, ok := model.Provider.(*AzureProvider)
	require.True(t, ok)
	require.Empty(t, azureProvider.APIKey)
	require.NotNil(t, azureProvider.WorkloadIdentity)
	require.Equal(t, "wi-client-id", azureProvider.WorkloadIdentity.ClientID)
	require.Equal(t, "wi-tenant-id", azureProvider.WorkloadIdentity.TenantID)
}

func TestLoadAzureConfig_MultipleAuthMethods_Error(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "azure-secret", Namespace: "default"},
		Data: map[string][]byte{
			"api-key":   []byte("test-key"),
			"client-id": []byte("test-client"),
		},
	}
	fakeClient := setupAzureTestClient([]client.Object{secret})
	resolver := common.NewValueSourceResolver(fakeClient)
	ctx := context.Background()

	config := &arkv1alpha1.AzureModelConfig{
		BaseURL: arkv1alpha1.ValueSource{Value: "https://api.azure.com"},
		Auth: &arkv1alpha1.AzureAuth{
			APIKey: &arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "azure-secret"},
						Key:                  "api-key",
					},
				},
			},
			ManagedIdentity: &arkv1alpha1.AzureManagedIdentity{
				ClientID: &arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						SecretKeyRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "azure-secret"},
							Key:                  "client-id",
						},
					},
				},
			},
		},
	}

	model := &Model{}
	err := loadAzureConfig(ctx, resolver, config, "default", model, nil)

	require.Error(t, err)
	require.Contains(t, err.Error(), "exactly one authentication method must be specified")
}
