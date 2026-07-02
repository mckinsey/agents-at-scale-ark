package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBedrockInitClient_APIKeyUsesBearerAuth(t *testing.T) {
	bm := NewBedrockModel("anthropic.claude-v2", "us-east-1", "", "", "", "", "test-bedrock-key", "", nil)

	require.NoError(t, bm.initClient(context.Background()))
	require.NotNil(t, bm.client)

	opts := bm.client.Options()
	require.NotNil(t, opts.BearerAuthTokenProvider)
	require.Equal(t, []string{"httpBearerAuth"}, opts.AuthSchemePreference)
}

func TestBedrockInitClient_APIKeyWinsOverIAM(t *testing.T) {
	bm := NewBedrockModel("anthropic.claude-v2", "us-east-1", "", "test-access-key", "test-secret-key", "", "test-bedrock-key", "", nil)

	require.NoError(t, bm.initClient(context.Background()))

	opts := bm.client.Options()
	require.NotNil(t, opts.BearerAuthTokenProvider)
	require.Equal(t, []string{"httpBearerAuth"}, opts.AuthSchemePreference)
}

func TestBedrockInitClient_IAMOnlyUsesStaticCredentials(t *testing.T) {
	bm := NewBedrockModel("anthropic.claude-v2", "us-east-1", "", "test-access-key", "test-secret-key", "", "", "", nil)

	require.NoError(t, bm.initClient(context.Background()))

	opts := bm.client.Options()
	require.Nil(t, opts.BearerAuthTokenProvider)
	require.Empty(t, opts.AuthSchemePreference)
	require.NotNil(t, opts.Credentials)
}

func TestBedrockInitClient_NeitherUsesDefaultChain(t *testing.T) {
	bm := NewBedrockModel("anthropic.claude-v2", "us-east-1", "", "", "", "", "", "", nil)

	require.NoError(t, bm.initClient(context.Background()))

	opts := bm.client.Options()
	require.Nil(t, opts.BearerAuthTokenProvider)
	require.Empty(t, opts.AuthSchemePreference)
}
