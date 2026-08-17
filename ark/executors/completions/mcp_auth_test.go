package completions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkmcp "mckinsey.com/ark/internal/mcp"
)

const (
	authTestServerNS   = "mcp-ns"
	authTestCallerNS   = "team-a"
	authTestServerName = "test-server"
	authTestSecretName = "mcp-token"
	authTestToolName   = "greet-tool"
	authTestToken      = "tok-good"
)

// newAuthGatedTestMCPServer serves a real MCP streamable HTTP handler exposing
// a single `greet` tool, but only when the request carries
// `Authorization: Bearer <expectedToken>`. Anything else gets an RFC 9728
// challenge and a 401, which is what an OAuth-protected MCP server does to an
// unauthenticated session initialize. Pass an empty expectedToken to serve
// unauthenticated. The returned func reports every inbound Authorization value.
func newAuthGatedTestMCPServer(t *testing.T, expectedToken string) (string, func() []string) {
	t.Helper()

	var (
		mu   sync.Mutex
		seen []string
	)

	mcpServer := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "auth-mcp", Version: "v0.1.0"}, nil)
	mcpsdk.AddTool(mcpServer, &mcpsdk.Tool{Name: "greet", Description: "greet the caller"},
		func(_ context.Context, _ *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
			return &mcpsdk.CallToolResult{
				Content: []mcpsdk.Content{&mcpsdk.TextContent{Text: "Hi ark"}},
			}, nil, nil
		})
	mcpHandler := mcpsdk.NewStreamableHTTPHandler(
		func(*http.Request) *mcpsdk.Server { return mcpServer },
		&mcpsdk.StreamableHTTPOptions{Stateless: true, JSONResponse: true},
	)

	mux := http.NewServeMux()
	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.Header.Get("Authorization"))
		mu.Unlock()

		if expectedToken != "" && r.Header.Get("Authorization") != "Bearer "+expectedToken {
			host := "http://" + r.Host
			w.Header().Set("WWW-Authenticate",
				`Bearer realm="OAuth", resource_metadata="`+host+`/.well-known/oauth-protected-resource/mcp", error="invalid_token"`)
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid_token"}`))
			return
		}
		mcpHandler.ServeHTTP(w, r)
	})

	mux.HandleFunc("/.well-known/oauth-protected-resource/mcp", func(w http.ResponseWriter, r *http.Request) {
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"resource":              host + "/mcp",
			"resource_name":         "Fake MCP (Test)",
			"authorization_servers": []string{host},
		})
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(func() {
		srv.CloseClientConnections()
		srv.Close()
	})

	return srv.URL + "/mcp", func() []string {
		mu.Lock()
		defer mu.Unlock()
		return append([]string(nil), seen...)
	}
}

func newAuthTestPool(t *testing.T) *arkmcp.MCPClientPool {
	t.Helper()
	pool := arkmcp.NewMCPClientPool()
	t.Cleanup(func() { _ = pool.Close() })
	return pool
}

func newAuthTestMCPServerCRD(url string, ref *arkv1alpha1.TokenSecretReference, headers []arkv1alpha1.Header) *arkv1alpha1.MCPServer {
	server := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: authTestServerName, Namespace: authTestServerNS},
		Spec: arkv1alpha1.MCPServerSpec{
			Address:   arkv1alpha1.ValueSource{Value: url},
			Transport: "http",
			Headers:   headers,
		},
	}
	if ref != nil {
		server.Spec.Authorization = &arkv1alpha1.MCPServerAuthorizationSpec{TokenSecretRef: *ref}
	}
	return server
}

func newAuthTestTool(toolNamespace string) *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: authTestToolName, Namespace: toolNamespace},
		Spec: arkv1alpha1.ToolSpec{
			Type: "mcp",
			MCP: &arkv1alpha1.MCPToolRef{
				MCPServerRef: arkv1alpha1.MCPServerRef{
					Name:      authTestServerName,
					Namespace: authTestServerNS,
				},
				ToolName: "greet",
			},
		},
	}
}

func newAuthTestSecret(namespace string, data map[string][]byte) *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: authTestSecretName, Namespace: namespace},
		Data:       data,
	}
}

func bearerHeadersSeen(seen []string) []string {
	var out []string
	for _, value := range seen {
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

// The regression this whole change exists for: the executor must send the
// bearer from spec.authorization.tokenSecretRef. The connection is established
// eagerly inside GetOrCreateClient, so a missing bearer fails at session
// initialize - before any tool call - which is why discovery-only coverage
// never caught it.
func TestCreateMCPExecutorInjectsBearerFromTokenSecretRef(t *testing.T) {
	tests := []struct {
		name       string
		ref        arkv1alpha1.TokenSecretReference
		secretData map[string][]byte
	}{
		{
			name:       "default access token key",
			ref:        arkv1alpha1.TokenSecretReference{Name: authTestSecretName},
			secretData: map[string][]byte{arkv1alpha1.DefaultAccessTokenKey: []byte(authTestToken)},
		},
		{
			name: "custom access token key",
			ref: arkv1alpha1.TokenSecretReference{
				Name:           authTestSecretName,
				AccessTokenKey: "MY_CUSTOM_ACCESS_TOKEN",
			},
			secretData: map[string][]byte{
				"MY_CUSTOM_ACCESS_TOKEN":          []byte(authTestToken),
				arkv1alpha1.DefaultAccessTokenKey: []byte("tok-wrong"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, seenAuth := newAuthGatedTestMCPServer(t, authTestToken)
			k8sClient := setupTestClient([]client.Object{
				newAuthTestMCPServerCRD(url, &tt.ref, nil),
				newAuthTestSecret(authTestServerNS, tt.secretData),
				newAuthTestTool(authTestServerNS),
			})

			executor, err := createMCPExecutor(context.Background(), k8sClient,
				newAuthTestTool(authTestServerNS), authTestServerNS,
				newAuthTestPool(t), nil)

			require.NoError(t, err, "session initialize must succeed with the bearer applied")

			result, err := executor.Execute(context.Background(), ToolCall{ID: "call-1"})
			require.NoError(t, err, "the bearer must persist onto tools/call")
			assert.Equal(t, "Hi ark", result.Content)

			for _, value := range bearerHeadersSeen(seenAuth()) {
				assert.Equal(t, "Bearer "+authTestToken, value)
			}
		})
	}
}

func TestCreateMCPExecutorWithoutAuthorizationSendsNoBearer(t *testing.T) {
	url, seenAuth := newAuthGatedTestMCPServer(t, "")
	k8sClient := setupTestClient([]client.Object{
		newAuthTestMCPServerCRD(url, nil, nil),
		newAuthTestTool(authTestServerNS),
	})

	_, err := createMCPExecutor(context.Background(), k8sClient,
		newAuthTestTool(authTestServerNS), authTestServerNS,
		newAuthTestPool(t), nil)

	require.NoError(t, err)
	assert.Empty(t, bearerHeadersSeen(seenAuth()))
}

// A referenced-but-absent Secret, and a Secret with no usable token, are both
// the expected pre-authorization state. Neither may harden into a registration
// failure - the server is left to answer with 401 as it does today.
func TestCreateMCPExecutorFallsThroughWhenNoTokenAvailable(t *testing.T) {
	tests := []struct {
		name       string
		withSecret bool
		secretData map[string][]byte
	}{
		{name: "secret missing", withSecret: false},
		{name: "secret present but empty", withSecret: true, secretData: map[string][]byte{}},
		{
			name:       "access token key present but blank",
			withSecret: true,
			secretData: map[string][]byte{arkv1alpha1.DefaultAccessTokenKey: []byte("")},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, seenAuth := newAuthGatedTestMCPServer(t, "")
			ref := arkv1alpha1.TokenSecretReference{Name: authTestSecretName}
			objects := []client.Object{
				newAuthTestMCPServerCRD(url, &ref, nil),
				newAuthTestTool(authTestServerNS),
			}
			if tt.withSecret {
				objects = append(objects, newAuthTestSecret(authTestServerNS, tt.secretData))
			}

			_, err := createMCPExecutor(context.Background(), setupTestClient(objects),
				newAuthTestTool(authTestServerNS), authTestServerNS,
				newAuthTestPool(t), nil)

			require.NoError(t, err)
			assert.Empty(t, bearerHeadersSeen(seenAuth()))
		})
	}
}

// The token Secret belongs to the MCPServer's namespace, not the caller's. The
// decoy proves it: if the caller namespace were used, the wrong token would be
// sent and the gated server would reject the session.
func TestCreateMCPExecutorResolvesTokenSecretInMCPServerNamespace(t *testing.T) {
	url, seenAuth := newAuthGatedTestMCPServer(t, authTestToken)
	ref := arkv1alpha1.TokenSecretReference{Name: authTestSecretName}
	k8sClient := setupTestClient([]client.Object{
		newAuthTestMCPServerCRD(url, &ref, nil),
		newAuthTestSecret(authTestServerNS, map[string][]byte{
			arkv1alpha1.DefaultAccessTokenKey: []byte(authTestToken),
		}),
		newAuthTestSecret(authTestCallerNS, map[string][]byte{
			arkv1alpha1.DefaultAccessTokenKey: []byte("tok-decoy"),
		}),
		newAuthTestTool(authTestCallerNS),
	})

	executor, err := createMCPExecutor(context.Background(), k8sClient,
		newAuthTestTool(authTestCallerNS), authTestCallerNS,
		newAuthTestPool(t), nil)

	require.NoError(t, err)

	result, err := executor.Execute(context.Background(), ToolCall{ID: "call-1"})
	require.NoError(t, err)
	assert.Equal(t, "Hi ark", result.Content)

	for _, value := range bearerHeadersSeen(seenAuth()) {
		assert.Equal(t, "Bearer "+authTestToken, value)
	}
}

// spec.headers secrets follow the same rule as the token Secret, matching what
// the controller already does during discovery.
func TestCreateMCPExecutorResolvesSpecHeadersInMCPServerNamespace(t *testing.T) {
	url, _ := newAuthGatedTestMCPServer(t, "")
	headers := []arkv1alpha1.Header{{
		Name: "X-Org-Id",
		Value: arkv1alpha1.HeaderValue{
			ValueFrom: &arkv1alpha1.HeaderValueSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: authTestSecretName},
					Key:                  "org",
				},
			},
		},
	}}
	k8sClient := setupTestClient([]client.Object{
		newAuthTestMCPServerCRD(url, nil, headers),
		newAuthTestSecret(authTestServerNS, map[string][]byte{"org": []byte("acme")}),
		newAuthTestTool(authTestCallerNS),
	})

	_, err := createMCPExecutor(context.Background(), k8sClient,
		newAuthTestTool(authTestCallerNS), authTestCallerNS,
		newAuthTestPool(t), nil)

	require.NoError(t, err, "the header secret lives in the MCPServer namespace, not the caller's")
}

// Precedence: spec.headers < spec.authorization bearer < agent/query overrides.
// NewMCPClient copies the override headers last, so an explicit per-run
// Authorization must still win over the shared token.
func TestCreateMCPExecutorQueryOverrideBeatsTokenSecretRefBearer(t *testing.T) {
	const overrideToken = "tok-override"

	url, seenAuth := newAuthGatedTestMCPServer(t, overrideToken)
	ref := arkv1alpha1.TokenSecretReference{Name: authTestSecretName}
	k8sClient := setupTestClient([]client.Object{
		newAuthTestMCPServerCRD(url, &ref, nil),
		newAuthTestSecret(authTestServerNS, map[string][]byte{
			arkv1alpha1.DefaultAccessTokenKey: []byte(authTestToken),
		}),
		newAuthTestTool(authTestServerNS),
	})
	mcpSettings := map[string]arkmcp.MCPSettings{
		authTestServerNS + "/" + authTestServerName: {
			Headers: map[string]string{"Authorization": "Bearer " + overrideToken},
		},
	}

	_, err := createMCPExecutor(context.Background(), k8sClient,
		newAuthTestTool(authTestServerNS), authTestServerNS,
		newAuthTestPool(t), mcpSettings)

	require.NoError(t, err)
	for _, value := range bearerHeadersSeen(seenAuth()) {
		assert.Equal(t, "Bearer "+overrideToken, value)
	}
}
