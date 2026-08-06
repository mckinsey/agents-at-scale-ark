/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"time"

	"github.com/golang-jwt/jwt/v5"
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

type machineMCPOpts struct {
	// advertiseClientCredentials controls whether RFC 8414 metadata
	// declares the capabilities the client-credentials flow requires.
	// False reproduces the browser-only server shape.
	advertiseClientCredentials bool
	tokenTTLSeconds            int64
}

type machineMCPServer struct {
	*httptest.Server
	mints      *atomic.Int32
	privateKey []byte
}

// newMachineMCPServer is an MCP server protected by its own
// authorization server: it 401s without a bearer it minted itself, and
// its token endpoint verifies the RFC 7523 assertion signature rather
// than accepting anything presented to it.
func newMachineMCPServer(opts machineMCPOpts) *machineMCPServer {
	GinkgoHelper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	Expect(err).NotTo(HaveOccurred())
	der, err := x509.MarshalECPrivateKey(key)
	Expect(err).NotTo(HaveOccurred())
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})

	ttl := opts.tokenTTLSeconds
	if ttl == 0 {
		ttl = 3600
	}

	var issued atomic.Value
	issued.Store("")
	mints := &atomic.Int32{}

	mux := http.NewServeMux()

	server := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "machine-mcp", Version: "v0.1.0"}, nil)
	mcpsdk.AddTool(server, &mcpsdk.Tool{Name: "echo", Description: "echo the input"},
		func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
			return &mcpsdk.CallToolResult{}, nil, nil
		})
	mcpHandler := mcpsdk.NewStreamableHTTPHandler(
		func(r *http.Request) *mcpsdk.Server { return server },
		&mcpsdk.StreamableHTTPOptions{Stateless: true, JSONResponse: true},
	)

	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		want, _ := issued.Load().(string)
		if want == "" || r.Header.Get("Authorization") != "Bearer "+want {
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
			"resource":                 host + "/mcp",
			"resource_name":            "Machine MCP (Test)",
			"authorization_servers":    []string{host},
			"bearer_methods_supported": []string{"header"},
		})
	})

	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		host := "http://" + r.Host
		doc := map[string]any{
			"issuer":         host,
			"token_endpoint": host + "/token",
			// oauthex rejects an authorization server that does not
			// advertise PKCE, regardless of the grant type in use.
			"response_types_supported":         []string{"code"},
			"code_challenge_methods_supported": []string{"S256"},
		}
		if opts.advertiseClientCredentials {
			doc["grant_types_supported"] = []string{"authorization_code", "client_credentials"}
			doc["token_endpoint_auth_methods_supported"] = []string{"private_key_jwt"}
			doc["token_endpoint_auth_signing_alg_values_supported"] = []string{"ES256"}
		} else {
			doc["grant_types_supported"] = []string{"authorization_code", "refresh_token"}
			doc["token_endpoint_auth_methods_supported"] = []string{"client_secret_post"}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(doc)
	})

	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
			return
		}
		if _, err := jwt.Parse(r.PostForm.Get("client_assertion"),
			func(*jwt.Token) (any, error) { return &key.PublicKey, nil },
			jwt.WithValidMethods([]string{"ES256"})); err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid_client","error_description":"assertion did not verify"}`))
			return
		}

		tok := fmt.Sprintf("minted-token-%d", mints.Add(1))
		issued.Store(tok)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": tok,
			"token_type":   "Bearer",
			"expires_in":   ttl,
		})
	})

	return &machineMCPServer{Server: httptest.NewServer(mux), mints: mints, privateKey: keyPEM}
}

// createMachineMCPServer wires a signing-key Secret, an empty token
// Secret, and an MCPServer configured for client_credentials.
func createMachineMCPServer(ctx context.Context, name, mcpURL string, keyPEM []byte) (tokenSecretName string) {
	GinkgoHelper()

	keySecretName := name + "-signing-key"
	tokenSecretName = name + "-token"

	keySecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: keySecretName, Namespace: "default"},
		Data:       map[string][]byte{"private.pem": keyPEM},
	}
	Expect(k8sClient.Create(ctx, keySecret)).To(Succeed())
	DeferCleanup(func() { _ = k8sClient.Delete(ctx, keySecret) })

	mcpServer := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: arkv1alpha1.MCPServerSpec{
			Address:   arkv1alpha1.ValueSource{Value: mcpURL},
			Transport: "http",
			Timeout:   "5s",
			Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
				TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: tokenSecretName},
				ClientCredentials: &arkv1alpha1.ClientCredentialsSpec{
					ClientID: "ark-client",
					Scopes:   []string{"mcp:tools"},
					ClientAuthentication: arkv1alpha1.ClientAuthenticationSpec{
						PrivateKeyJWT: arkv1alpha1.PrivateKeyJWTSpec{
							SecretKeyRef: arkv1alpha1.SigningKeySecretKeyRef{
								Name: keySecretName,
								Key:  "private.pem",
							},
							Algorithm: "ES256",
						},
					},
				},
			},
		},
	}
	Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
	DeferCleanup(func() {
		_ = k8sClient.Delete(ctx, mcpServer)
		_ = k8sClient.Delete(ctx, &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: tokenSecretName, Namespace: "default"},
		})
	})
	return tokenSecretName
}

func newMachineReconciler() *MCPServerReconciler {
	return &MCPServerReconciler{
		Client:    k8sClient,
		APIReader: k8sClient,
		Scheme:    k8sClient.Scheme(),
		Eventing:  eventnoop.NewProvider(),
	}
}

var _ = Describe("MCPServer Controller — client_credentials token acquisition", func() {
	ctx := context.Background()
	nn := func(name string) types.NamespacedName {
		return types.NamespacedName{Name: name, Namespace: "default"}
	}

	It("mints a token, writes the Secret, and reaches Authorized with no human involved", func() {
		srv := newMachineMCPServer(machineMCPOpts{advertiseClientCredentials: true})
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-cc-happy"
		tokenSecretName := createMachineMCPServer(ctx, name, srv.URL+"/mcp", srv.privateKey)

		r := newMachineReconciler()
		Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, nn(name), out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateAuthorized))
		Expect(out.Status.Authorization.ExpiresAt).NotTo(BeNil())

		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Status).To(Equal(metav1.ConditionTrue))

		// The controller created the output Secret and populated it.
		secret := &corev1.Secret{}
		Expect(k8sClient.Get(ctx, nn(tokenSecretName), secret)).To(Succeed())
		Expect(string(secret.Data["access_token"])).To(HavePrefix("minted-token-"))
		Expect(secret.Data).To(HaveKey("expires_at"))
		_, err := time.Parse(time.RFC3339, string(secret.Data["expires_at"]))
		Expect(err).NotTo(HaveOccurred())

		// Tools are the real proof: they could only be listed by
		// presenting the bearer the controller just minted.
		tools, err := r.listAllMCPTools(ctx, "default", name)
		Expect(err).NotTo(HaveOccurred())
		Expect(tools).To(HaveLen(1))
		Expect(tools[0].Spec.MCP.ToolName).To(Equal("echo"))
	})

	It("does not mint again while the current token is still valid", func() {
		srv := newMachineMCPServer(machineMCPOpts{advertiseClientCredentials: true})
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-cc-idempotent"
		createMachineMCPServer(ctx, name, srv.URL+"/mcp", srv.privateKey)

		r := newMachineReconciler()
		Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())
		afterFirst := srv.mints.Load()
		Expect(afterFirst).To(BeNumerically(">=", 1))

		for range 3 {
			Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())
		}
		Expect(srv.mints.Load()).To(Equal(afterFirst),
			"a valid token must suppress further minting — this is the idempotency guard")
	})

	It("renews when the stored token is inside the renewal skew", func() {
		srv := newMachineMCPServer(machineMCPOpts{advertiseClientCredentials: true})
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-cc-renew"
		tokenSecretName := createMachineMCPServer(ctx, name, srv.URL+"/mcp", srv.privateKey)

		r := newMachineReconciler()
		Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())
		afterFirst := srv.mints.Load()

		// Backdate expiry to inside the skew window without touching the
		// token itself — exactly what the passage of time would do.
		Eventually(func() error {
			secret := &corev1.Secret{}
			if err := k8sClient.Get(ctx, nn(tokenSecretName), secret); err != nil {
				return err
			}
			secret.Data["expires_at"] = []byte(time.Now().Add(10 * time.Second).UTC().Format(time.RFC3339))
			return k8sClient.Update(ctx, secret)
		}, "5s", "100ms").Should(Succeed())

		Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())
		Expect(srv.mints.Load()).To(BeNumerically(">", afterFirst),
			"a token inside the skew window must be replaced")
	})

	It("refuses to mint against a server that does not advertise the capabilities", func() {
		srv := newMachineMCPServer(machineMCPOpts{advertiseClientCredentials: false})
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-cc-no-caps"
		createMachineMCPServer(ctx, name, srv.URL+"/mcp", srv.privateKey)

		r := newMachineReconciler()
		Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())

		Expect(srv.mints.Load()).To(BeZero(),
			"validation must refuse before any assertion reaches the token endpoint")

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, nn(name), out)).To(Succeed())
		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Status).To(Equal(metav1.ConditionFalse))
	})

	It("reports TokenAcquisitionFailed when the signing key Secret is missing", func() {
		srv := newMachineMCPServer(machineMCPOpts{advertiseClientCredentials: true})
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-cc-no-key"
		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: name + "-token"},
					ClientCredentials: &arkv1alpha1.ClientCredentialsSpec{
						ClientID: "ark-client",
						ClientAuthentication: arkv1alpha1.ClientAuthenticationSpec{
							PrivateKeyJWT: arkv1alpha1.PrivateKeyJWTSpec{
								SecretKeyRef: arkv1alpha1.SigningKeySecretKeyRef{
									Name: "does-not-exist",
									Key:  "private.pem",
								},
								Algorithm: "ES256",
							},
						},
					},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		r := newMachineReconciler()
		Expect(reconcileUntilStable(ctx, r, nn(name))).To(Succeed())

		Expect(srv.mints.Load()).To(BeZero())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, nn(name), out)).To(Succeed())
		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Status).To(Equal(metav1.ConditionFalse))
	})
})
