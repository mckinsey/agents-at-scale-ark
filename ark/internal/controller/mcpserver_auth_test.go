/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

type fakeMCPServerOpts struct {
	compliant              bool
	brokenResourceMetadata bool
	brokenAuthServer       bool
}

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
