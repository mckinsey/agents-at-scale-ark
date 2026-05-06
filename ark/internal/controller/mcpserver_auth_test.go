/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"time"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	eventmock "mckinsey.com/ark/internal/eventing/mock"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	eventrecorder "mckinsey.com/ark/internal/eventing/recorder"
)

// mcpEventProvider wraps a MockEventEmitter with the minimum MCPServerRecorder
// surface needed by tests that assert on emitted events. Other recorders
// return nil — none of the MCPServer controller paths exercise them.
type mcpEventProvider struct {
	emitter  *eventmock.MockEventEmitter
	recorder eventing.MCPServerRecorder
}

func newMCPEventProvider() *mcpEventProvider {
	e := eventmock.NewMockEventEmitter()
	return &mcpEventProvider{emitter: e, recorder: eventrecorder.NewMCPServerRecorder(e)}
}

func (p *mcpEventProvider) ModelRecorder() eventing.ModelRecorder                     { return nil }
func (p *mcpEventProvider) A2aRecorder() eventing.A2aRecorder                         { return nil }
func (p *mcpEventProvider) AgentRecorder() eventing.AgentRecorder                     { return nil }
func (p *mcpEventProvider) TeamRecorder() eventing.TeamRecorder                       { return nil }
func (p *mcpEventProvider) ExecutionEngineRecorder() eventing.ExecutionEngineRecorder { return nil }
func (p *mcpEventProvider) ToolRecorder() eventing.ToolRecorder                       { return nil }
func (p *mcpEventProvider) MCPServerRecorder() eventing.MCPServerRecorder             { return p.recorder }
func (p *mcpEventProvider) QueryRecorder() eventing.QueryRecorder                     { return nil }
func (p *mcpEventProvider) MemoryRecorder() eventing.MemoryRecorder                   { return nil }

type fakeMCPServerOpts struct {
	compliant              bool
	brokenResourceMetadata bool
	brokenAuthServer       bool
}

// fakeMCPServer serves the minimal surface a protected MCP server
// exposes during discovery: an MCP endpoint that returns 401 with
// a WWW-Authenticate challenge, and the RFC 9728 + RFC 8414
// well-known documents. The behaviour is switched by `compliant` so
// the AuthorizationDiscoveryFailed path can be exercised too.
func fakeMCPServer(compliant bool) *httptest.Server {
	return fakeMCPServerWithOpts(fakeMCPServerOpts{compliant: compliant})
}

func fakeMCPServerWithOpts(opts fakeMCPServerOpts) *httptest.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		if opts.compliant {
			host := "http://" + r.Host
			w.Header().Set("WWW-Authenticate",
				`Bearer realm="OAuth", resource_metadata="`+host+`/.well-known/oauth-protected-resource/mcp", error="invalid_token"`)
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_token"}`))
	})

	mux.HandleFunc("/.well-known/oauth-protected-resource/mcp", func(w http.ResponseWriter, r *http.Request) {
		if opts.brokenResourceMetadata {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"resource":                 host + "/mcp",
			"resource_name":            "Fake MCP (Test)",
			"authorization_servers":    []string{host},
			"bearer_methods_supported": []string{"header"},
		})
	})

	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		if opts.brokenAuthServer {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                           host,
			"authorization_endpoint":           host + "/authorize",
			"token_endpoint":                   host + "/token",
			"registration_endpoint":            host + "/register",
			"jwks_uri":                         host + "/.well-known/jwks.json",
			"response_types_supported":         []string{"code"},
			"grant_types_supported":            []string{"authorization_code", "refresh_token"},
			"code_challenge_methods_supported": []string{"S256"},
		})
	})

	return httptest.NewServer(mux)
}

func reconcileUntilStable(ctx context.Context, r *MCPServerReconciler, nn types.NamespacedName) error {
	for range 3 {
		if _, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: nn}); err != nil {
			return err
		}
	}
	return nil
}

var _ = Describe("MCPServer Controller — authorization detection", func() {
	ctx := context.Background()

	It("populates status.authorization with state=Required when the server returns 401 with a compliant WWW-Authenticate header", func() {
		srv := fakeMCPServer(true)
		defer srv.Close()

		const name = "mcp-auth-compliant"
		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(ctx, mcpServer)
		})

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil(), "status.authorization should be populated")
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateRequired))
		Expect(out.Status.Authorization.Resource).To(Equal(srv.URL + "/mcp"))
		Expect(out.Status.Authorization.ResourceName).To(Equal("Fake MCP (Test)"))
		Expect(out.Status.Authorization.AuthorizationServers).To(ConsistOf(srv.URL))
		Expect(out.Status.Authorization.AuthorizationEndpoint).To(Equal(srv.URL + "/authorize"))
		Expect(out.Status.Authorization.TokenEndpoint).To(Equal(srv.URL + "/token"))
		Expect(out.Status.Authorization.RegistrationEndpoint).To(Equal(srv.URL + "/register"))
		Expect(out.Status.Authorization.GrantTypesSupported).To(ConsistOf("authorization_code", "refresh_token"))
		Expect(out.Status.Authorization.LastDiscovered).NotTo(BeNil())

		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Status).To(Equal(metav1.ConditionFalse))
		Expect(avail.Reason).To(Equal(MCPServerReasonAuthorizationRequired))

		disc := findCondition(out.Status.Conditions, MCPServerDiscovering)
		Expect(disc).NotTo(BeNil())
		Expect(disc.Status).To(Equal(metav1.ConditionFalse))
		Expect(disc.Reason).To(Equal(MCPServerReasonAuthorizationRequired))
	})

	It("surfaces state=DiscoveryFailed when the protected resource metadata endpoint is broken", func() {
		srv := fakeMCPServerWithOpts(fakeMCPServerOpts{compliant: true, brokenResourceMetadata: true})
		defer srv.Close()

		const name = "mcp-auth-broken-metadata"
		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(ctx, mcpServer)
		})

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateDiscoveryFailed))

		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Reason).To(Equal(MCPServerReasonAuthorizationDiscoveryFailed))
	})

	It("populates authorization state even when auth server metadata fetch fails", func() {
		srv := fakeMCPServerWithOpts(fakeMCPServerOpts{compliant: true, brokenAuthServer: true})
		defer srv.Close()

		const name = "mcp-auth-broken-authserver"
		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(ctx, mcpServer)
		})

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateRequired))
		Expect(out.Status.Authorization.Resource).To(Equal(srv.URL + "/mcp"))
		Expect(out.Status.Authorization.ResourceName).To(Equal("Fake MCP (Test)"))
		Expect(out.Status.Authorization.AuthorizationServers).To(ConsistOf(srv.URL))
		Expect(out.Status.Authorization.AuthorizationEndpoint).To(BeEmpty())
		Expect(out.Status.Authorization.TokenEndpoint).To(BeEmpty())

		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Reason).To(Equal(MCPServerReasonAuthorizationRequired))
	})

	It("surfaces state=DiscoveryFailed when the server returns 401 without a usable WWW-Authenticate header", func() {
		srv := fakeMCPServer(false)
		defer srv.Close()

		const name = "mcp-auth-noncompliant"
		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(ctx, mcpServer)
		})

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateDiscoveryFailed))
		// Metadata fields must be empty so the dashboard can't try to drive
		// an OAuth flow it cannot complete.
		Expect(out.Status.Authorization.ResourceMetadataURL).To(BeEmpty())
		Expect(out.Status.Authorization.AuthorizationServers).To(BeEmpty())
		Expect(out.Status.Authorization.AuthorizationEndpoint).To(BeEmpty())

		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Reason).To(Equal(MCPServerReasonAuthorizationDiscoveryFailed))
	})
})

func findCondition(conds []metav1.Condition, t string) *metav1.Condition {
	for i := range conds {
		if conds[i].Type == t {
			return &conds[i]
		}
	}
	return nil
}

// fakeAuthorizedMCPServer returns 401 with an RFC 9728-compliant
// WWW-Authenticate header when the incoming request has no
// `Authorization: Bearer <expectedToken>`, and otherwise serves a real
// MCP streamable HTTP handler exposing a single tool. This lets the
// controller path exercise both the Required and Authorized branches
// end to end.
func fakeAuthorizedMCPServer(expectedToken string) *httptest.Server {
	mux := http.NewServeMux()

	server := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "auth-mcp", Version: "v0.1.0"}, nil)
	mcpsdk.AddTool(server, &mcpsdk.Tool{Name: "ping", Description: "ping the server"},
		func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
			return &mcpsdk.CallToolResult{}, nil, nil
		})
	mcpHandler := mcpsdk.NewStreamableHTTPHandler(
		func(r *http.Request) *mcpsdk.Server { return server },
		&mcpsdk.StreamableHTTPOptions{Stateless: true, JSONResponse: true},
	)

	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+expectedToken {
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
			"resource_name":            "Fake MCP (Test)",
			"authorization_servers":    []string{host},
			"bearer_methods_supported": []string{"header"},
		})
	})

	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                           host,
			"authorization_endpoint":           host + "/authorize",
			"token_endpoint":                   host + "/token",
			"registration_endpoint":            host + "/register",
			"response_types_supported":         []string{"code"},
			"grant_types_supported":            []string{"authorization_code", "refresh_token"},
			"code_challenge_methods_supported": []string{"S256"},
		})
	})

	return httptest.NewServer(mux)
}

// createEmptyAuthSecretAndMCPServer wires an MCPServer at mcpURL to a Secret
// with no token data. Used by tests that drive the controller through paths
// where the Secret exists but carries nothing the controller can use.
func createEmptyAuthSecretAndMCPServer(ctx context.Context, name, secretName, mcpURL string) {
	GinkgoHelper()
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
		Data:       map[string][]byte{},
	}
	Expect(k8sClient.Create(ctx, secret)).To(Succeed())
	DeferCleanup(func() { _ = k8sClient.Delete(ctx, secret) })

	mcpServer := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: arkv1alpha1.MCPServerSpec{
			Address:   arkv1alpha1.ValueSource{Value: mcpURL},
			Transport: "http",
			Timeout:   "5s",
			Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
				TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
			},
		},
	}
	Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
	DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })
}

var _ = Describe("MCPServer Controller — Bearer token injection via tokenSecretRef", func() {
	ctx := context.Background()

	It("transitions to Authorized and publishes expiresAt when the referenced Secret carries a valid access token", func() {
		const token = "s3cret-access-token"
		srv := fakeAuthorizedMCPServer(token)
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-auth-token-ok"
		const secretName = "mcp-auth-token-ok-secret"
		expiry := time.Now().Add(1 * time.Hour).UTC().Truncate(time.Second)

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
			Data: map[string][]byte{
				"access_token": []byte(token),
				"expires_at":   []byte(expiry.Format(time.RFC3339)),
			},
		}
		Expect(k8sClient.Create(ctx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, secret) })

		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateAuthorized))
		Expect(out.Status.Authorization.Resource).To(Equal(srv.URL + "/mcp"))
		Expect(out.Status.Authorization.ExpiresAt).NotTo(BeNil())
		Expect(out.Status.Authorization.ExpiresAt.Time.Equal(expiry)).To(BeTrue())
		Expect(out.Status.Authorization.LastDiscovered).NotTo(BeNil())

		avail := findCondition(out.Status.Conditions, MCPServerAvailable)
		Expect(avail).NotTo(BeNil())
		Expect(avail.Status).To(Equal(metav1.ConditionTrue))
		Expect(avail.Reason).To(Equal(MCPServerReasonAuthorized))

		prevTransition := avail.LastTransitionTime
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())
		out2 := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out2)).To(Succeed())
		availAfter := findCondition(out2.Status.Conditions, MCPServerAvailable)
		Expect(availAfter).NotTo(BeNil())
		Expect(availAfter.LastTransitionTime.Equal(&prevTransition)).To(BeTrue(),
			"Available.lastTransitionTime should not bump when Secret content and state are unchanged")
	})

	It("falls through to state=Required when the referenced Secret exists but has no access_token key", func() {
		srv := fakeAuthorizedMCPServer("some-token-the-controller-does-not-have")
		defer srv.Close()

		const name = "mcp-auth-token-empty"
		const secretName = "mcp-auth-token-empty-secret"

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
			Data:       map[string][]byte{},
		}
		Expect(k8sClient.Create(ctx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, secret) })

		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateRequired))
		Expect(out.Status.Authorization.ExpiresAt).To(BeNil())
	})

	It("falls through to state=Required when the referenced Secret is missing entirely", func() {
		srv := fakeAuthorizedMCPServer("unreachable")
		defer srv.Close()

		const name = "mcp-auth-token-missing"

		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "does-not-exist"},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		r := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())

		Expect(out.Status.Authorization).NotTo(BeNil())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateRequired))
	})

	It("emits a TokenRejected Warning event when the upstream returns 401 after a previously Authorized state", func() {
		// Server initially accepts token A. Flip it to expect token B
		// mid-test so the stored Secret becomes stale — the next
		// reconcile observes a fresh 401 from a server whose last
		// observed state was Authorized. That is the transition the
		// TokenRejected event exists to surface.
		const acceptedToken = "initial-valid-token"
		const rotatedToken = "server-rotated-to-this"

		currentExpected := acceptedToken
		srv := httptest.NewServer(mux401Toggling(&currentExpected))
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-auth-token-rejected"
		const secretName = "mcp-auth-token-rejected-secret"
		expiry := time.Now().Add(1 * time.Hour).UTC().Truncate(time.Second)

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
			Data: map[string][]byte{
				"access_token": []byte(acceptedToken),
				"expires_at":   []byte(expiry.Format(time.RFC3339)),
			},
		}
		Expect(k8sClient.Create(ctx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, secret) })

		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		evtProvider := newMCPEventProvider()
		r := &MCPServerReconciler{Client: k8sClient, Scheme: k8sClient.Scheme(), Eventing: evtProvider}

		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())
		out := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out)).To(Succeed())
		Expect(out.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateAuthorized))

		// Server rotates; stored token is now stale.
		currentExpected = rotatedToken

		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())
		out2 := &arkv1alpha1.MCPServer{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: "default"}, out2)).To(Succeed())
		Expect(out2.Status.Authorization.State).To(Equal(arkv1alpha1.MCPServerAuthorizationStateRequired))

		events := evtProvider.emitter.GetEvents()
		var tokenRejected *eventmock.Event
		for i := range events {
			if events[i].Reason == "TokenRejected" {
				tokenRejected = &events[i]
				break
			}
		}
		Expect(tokenRejected).NotTo(BeNil(), "expected a TokenRejected event on Authorized → Required transition")
		Expect(tokenRejected.Type).To(Equal("Warning"))
		Expect(tokenRejected.Message).To(ContainSubstring("previously-Authorized"))
	})

	It("does NOT emit TokenRejected on the first-time Required transition (no prior Authorized state)", func() {
		// Secret has no access_token → controller never marks Authorized.
		// The 401 path runs but must emit AuthorizationRequired, not
		// TokenRejected.
		srv := fakeAuthorizedMCPServer("never-used-in-this-test")
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-auth-first-required"
		const secretName = "mcp-auth-first-required-secret"
		createEmptyAuthSecretAndMCPServer(ctx, name, secretName, srv.URL+"/mcp")

		evtProvider := newMCPEventProvider()
		r := &MCPServerReconciler{Client: k8sClient, Scheme: k8sClient.Scheme(), Eventing: evtProvider}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		for _, e := range evtProvider.emitter.GetEvents() {
			Expect(e.Reason).NotTo(Equal("TokenRejected"),
				"TokenRejected must not fire without a prior Authorized state")
		}
	})

	It("emits AuthorizationSecretUnresolvable when the referenced Secret does not exist", func() {
		srv := fakeAuthorizedMCPServer("never-used")
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-auth-secret-missing"
		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "does-not-exist-at-all"},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		evtProvider := newMCPEventProvider()
		r := &MCPServerReconciler{Client: k8sClient, Scheme: k8sClient.Scheme(), Eventing: evtProvider}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		var found *eventmock.Event
		for i := range evtProvider.emitter.GetEvents() {
			if evtProvider.emitter.GetEvents()[i].Reason == "AuthorizationSecretUnresolvable" {
				e := evtProvider.emitter.GetEvents()[i]
				found = &e
				break
			}
		}
		Expect(found).NotTo(BeNil(), "expected AuthorizationSecretUnresolvable event when Secret is missing")
		Expect(found.Type).To(Equal("Warning"))
		Expect(found.Message).To(ContainSubstring("does-not-exist-at-all"))
		Expect(found.Message).To(ContainSubstring("spec.authorization.tokenSecretRef.name"))
	})

	It("emits AuthorizationSecretUnresolvable for an overridden *Key that is absent from the Secret", func() {
		srv := fakeAuthorizedMCPServer("never-used")
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-auth-custom-key-missing"
		const secretName = "mcp-auth-custom-key-missing-secret"

		// Secret has data under the DEFAULT key names but the user has
		// overridden accessTokenKey to something else — which is absent.
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
			Data: map[string][]byte{
				"access_token": []byte("value-under-the-wrong-key"),
			},
		}
		Expect(k8sClient.Create(ctx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, secret) })

		mcpServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: srv.URL + "/mcp"},
				Transport: "http",
				Timeout:   "5s",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{
						Name:           secretName,
						AccessTokenKey: "MY_CUSTOM_ACCESS_TOKEN",
					},
				},
			},
		}
		Expect(k8sClient.Create(ctx, mcpServer)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, mcpServer) })

		evtProvider := newMCPEventProvider()
		r := &MCPServerReconciler{Client: k8sClient, Scheme: k8sClient.Scheme(), Eventing: evtProvider}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		var found *eventmock.Event
		for i := range evtProvider.emitter.GetEvents() {
			if evtProvider.emitter.GetEvents()[i].Reason == "AuthorizationSecretUnresolvable" {
				e := evtProvider.emitter.GetEvents()[i]
				found = &e
				break
			}
		}
		Expect(found).NotTo(BeNil(), "expected AuthorizationSecretUnresolvable event for overridden key")
		Expect(found.Type).To(Equal("Warning"))
		Expect(found.Message).To(ContainSubstring("MY_CUSTOM_ACCESS_TOKEN"))
		Expect(found.Message).To(ContainSubstring("accessTokenKey"))
	})

	It("stays SILENT when default keys are absent from the Secret (legitimate shell state)", func() {
		srv := fakeAuthorizedMCPServer("never-used")
		defer func() { srv.CloseClientConnections(); srv.Close() }()

		const name = "mcp-auth-shell-silent"
		const secretName = "mcp-auth-shell-silent-secret"
		createEmptyAuthSecretAndMCPServer(ctx, name, secretName, srv.URL+"/mcp")

		evtProvider := newMCPEventProvider()
		r := &MCPServerReconciler{Client: k8sClient, Scheme: k8sClient.Scheme(), Eventing: evtProvider}
		Expect(reconcileUntilStable(ctx, r, types.NamespacedName{Name: name, Namespace: "default"})).To(Succeed())

		for _, e := range evtProvider.emitter.GetEvents() {
			Expect(e.Reason).NotTo(Equal("AuthorizationSecretUnresolvable"),
				"default-key absence on an existing Secret must not fire Unresolvable — that is the legitimate shell state")
		}
	})
})

// mux401Toggling returns a handler that acts like fakeAuthorizedMCPServer
// but reads its expected bearer token from a pointer so the test can flip
// it between reconciles to simulate an upstream rotation or revocation.
func mux401Toggling(expected *string) *http.ServeMux {
	mux := http.NewServeMux()
	server := mcpsdk.NewServer(&mcpsdk.Implementation{Name: "auth-mcp", Version: "v0.1.0"}, nil)
	mcpsdk.AddTool(server, &mcpsdk.Tool{Name: "ping", Description: "ping"},
		func(ctx context.Context, req *mcpsdk.CallToolRequest, _ any) (*mcpsdk.CallToolResult, any, error) {
			return &mcpsdk.CallToolResult{}, nil, nil
		})
	mcpHandler := mcpsdk.NewStreamableHTTPHandler(
		func(r *http.Request) *mcpsdk.Server { return server },
		&mcpsdk.StreamableHTTPOptions{Stateless: true, JSONResponse: true},
	)
	mux.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+*expected {
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
	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                           host,
			"authorization_endpoint":           host + "/authorize",
			"token_endpoint":                   host + "/token",
			"registration_endpoint":            host + "/register",
			"response_types_supported":         []string{"code"},
			"grant_types_supported":            []string{"authorization_code", "refresh_token"},
			"code_challenge_methods_supported": []string{"S256"},
		})
	})
	return mux
}
