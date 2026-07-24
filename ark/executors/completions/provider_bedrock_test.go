package completions

import (
	"context"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestBedrockChatCompletion_APIKeySendsBearerOverWire(t *testing.T) {
	var gotAuth, gotPath string
	var gotBody []byte

	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"hello from mock bedrock"}],"id":"msg_mock","model":"anthropic.claude-v2","stop_reason":"end_turn","usage":{"input_tokens":7,"output_tokens":3}}`))
	}))
	defer srv.Close()

	caFile := filepath.Join(t.TempDir(), "ca.pem")
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw})
	require.NoError(t, os.WriteFile(caFile, certPEM, 0o600))
	t.Setenv("AWS_CA_BUNDLE", caFile)

	bm := NewBedrockModel("anthropic.claude-v2", "us-east-1", srv.URL, "", "", "", "test-bedrock-key", "", nil)

	completion, err := bm.ChatCompletion(context.Background(), []Message{NewUserMessage("Hello")}, 1, nil, ToolChoiceUnset)
	require.NoError(t, err)

	require.Equal(t, "Bearer test-bedrock-key", gotAuth)
	require.Equal(t, "/model/anthropic.claude-v2/invoke", gotPath)
	require.Contains(t, string(gotBody), "bedrock-2023-05-31")
	require.Len(t, completion.Choices, 1)
	require.Equal(t, "hello from mock bedrock", completion.Choices[0].Message.Content)
}
