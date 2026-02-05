package genai

import (
	"testing"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/stretchr/testify/require"
)

func TestAzureProvider_GetCredential_ManagedIdentity_System(t *testing.T) {
	provider := &AzureProvider{
		Model:           "gpt-4",
		BaseURL:         "https://test.openai.azure.com",
		ManagedIdentity: &AzureManagedIdentityConfig{},
	}

	cred, err := provider.getCredential()

	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "credential should be ManagedIdentityCredential")
}

func TestAzureProvider_GetCredential_ManagedIdentity_UserAssigned(t *testing.T) {
	provider := &AzureProvider{
		Model:   "gpt-4",
		BaseURL: "https://test.openai.azure.com",
		ManagedIdentity: &AzureManagedIdentityConfig{
			ClientID: "my-client-id-123",
		},
	}

	cred, err := provider.getCredential()

	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "credential should be ManagedIdentityCredential")
}
