package genai

import (
	"testing"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/stretchr/testify/require"
)

func TestAzureProvider_GetCredential_ManagedIdentity_SystemAssigned(t *testing.T) {
	ap := &AzureProvider{
		ManagedIdentity: &AzureManagedIdentityConfig{},
	}
	cred, err := ap.getCredential()
	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "expected *azidentity.ManagedIdentityCredential")
}

func TestAzureProvider_GetCredential_ManagedIdentity_UserAssigned(t *testing.T) {
	ap := &AzureProvider{
		ManagedIdentity: &AzureManagedIdentityConfig{ClientID: "my-client-id"},
	}
	cred, err := ap.getCredential()
	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "expected *azidentity.ManagedIdentityCredential")
}

func TestAzureProvider_GetCredential_WorkloadIdentity(t *testing.T) {
	ap := &AzureProvider{
		WorkloadIdentity: &AzureWorkloadIdentityConfig{
			ClientID: "wi-client-id",
			TenantID: "wi-tenant-id",
		},
	}
	cred, err := ap.getCredential()
	if err != nil {
		require.Contains(t, err.Error(), "token", "WorkloadIdentity path may fail in test env without token file")
		require.Nil(t, cred)
		return
	}
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.WorkloadIdentityCredential)
	require.True(t, ok, "expected *azidentity.WorkloadIdentityCredential")
}

func TestAzureProvider_GetCredential_NoIdentity_Error(t *testing.T) {
	ap := &AzureProvider{}
	cred, err := ap.getCredential()
	require.Error(t, err)
	require.Nil(t, cred)
	require.Contains(t, err.Error(), "no identity configuration")
}

func TestAzureProvider_GetCredential_ManagedIdentityPrecedence(t *testing.T) {
	ap := &AzureProvider{
		ManagedIdentity:  &AzureManagedIdentityConfig{ClientID: "mi-client"},
		WorkloadIdentity: &AzureWorkloadIdentityConfig{ClientID: "wi-client", TenantID: "wi-tenant"},
	}
	cred, err := ap.getCredential()
	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "ManagedIdentity takes precedence over WorkloadIdentity")
}
