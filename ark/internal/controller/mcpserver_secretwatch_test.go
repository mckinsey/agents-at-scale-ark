/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// testScheme is local: the Ark types are registered in the Ginkgo
// BeforeSuite, which does not run for plain Go tests in this package.
func testScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(s); err != nil {
		t.Fatalf("registering ark types: %v", err)
	}
	if err := corev1.AddToScheme(s); err != nil {
		t.Fatalf("registering core types: %v", err)
	}
	return s
}

func mcpServerWithSecrets(name, tokenSecret, signingKeySecret string) *arkv1alpha1.MCPServer {
	s := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: arkv1alpha1.MCPServerSpec{
			Address:   arkv1alpha1.ValueSource{Value: "https://mcp.example.com/mcp"},
			Transport: "http",
		},
	}
	if tokenSecret == "" {
		return s
	}
	s.Spec.Authorization = &arkv1alpha1.MCPServerAuthorizationSpec{
		TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: tokenSecret},
	}
	if signingKeySecret != "" {
		s.Spec.Authorization.ClientCredentials = &arkv1alpha1.ClientCredentialsSpec{
			ClientID: "ark-client",
			ClientAuthentication: arkv1alpha1.ClientAuthenticationSpec{
				PrivateKeyJWT: &arkv1alpha1.PrivateKeyJWTSpec{
					SecretKeyRef: arkv1alpha1.SigningKeySecretKeyRef{Name: signingKeySecret, Key: "private.pem"},
					Algorithm:    "ES256",
				},
			},
		}
	}
	return s
}

// TestMCPServerSecretIndexers covers the pure indexer functions. These are
// what let a Secret event resolve to its MCPServers without listing every
// MCPServer in the namespace.
func TestMCPServerSecretIndexers(t *testing.T) {
	machine := mcpServerWithSecrets("machine", "tok", "key")
	browser := mcpServerWithSecrets("browser", "tok-browser", "")
	bare := mcpServerWithSecrets("bare", "", "")

	cases := []struct {
		name           string
		obj            client.Object
		wantTokenIndex []string
		wantKeyIndex   []string
	}{
		{"machine-managed", machine, []string{"tok"}, []string{"key"}},
		{"browser flow has no signing key", browser, []string{"tok-browser"}, nil},
		{"no authorization at all", bare, nil, nil},
		{"wrong type is ignored", &corev1.Secret{}, nil, nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := mcpServerTokenSecretIndexer(tc.obj); !equalStrings(got, tc.wantTokenIndex) {
				t.Errorf("token index = %v, want %v", got, tc.wantTokenIndex)
			}
			if got := mcpServerSigningKeyIndexer(tc.obj); !equalStrings(got, tc.wantKeyIndex) {
				t.Errorf("signing key index = %v, want %v", got, tc.wantKeyIndex)
			}
		})
	}
}

// TestFindMCPServersForSecret exercises the map func against a client with
// the same indexes SetupWithManager registers.
//
// envtest cannot cover this: its client is a direct client with no cache,
// so custom field selectors are unsupported there.
func TestFindMCPServersForSecret(t *testing.T) {
	ctx := context.Background()

	machine := mcpServerWithSecrets("machine", "shared-secret", "key")
	browser := mcpServerWithSecrets("browser", "shared-secret", "")
	other := mcpServerWithSecrets("other", "unrelated", "unrelated-key")
	elsewhere := mcpServerWithSecrets("elsewhere", "shared-secret", "key")
	elsewhere.Namespace = "other-ns"

	c := fake.NewClientBuilder().
		WithScheme(testScheme(t)).
		WithObjects(machine, browser, other, elsewhere).
		WithIndex(&arkv1alpha1.MCPServer{}, indexTokenSecretRef, mcpServerTokenSecretIndexer).
		WithIndex(&arkv1alpha1.MCPServer{}, indexSigningKeyRef, mcpServerSigningKeyIndexer).
		Build()

	r := &MCPServerReconciler{Client: c}

	secret := func(name, ns string) *corev1.Secret {
		return &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns}}
	}

	t.Run("a token Secret enqueues every server referencing it", func(t *testing.T) {
		got := names(r.findMCPServersForSecret(ctx, secret("shared-secret", "default")))
		want := map[string]bool{"machine": true, "browser": true}
		if len(got) != 2 || !want[got[0]] || !want[got[1]] {
			t.Errorf("got %v, want machine and browser", got)
		}
	})

	// A rotated signing key is the case a poll-only design notices late.
	t.Run("a signing-key Secret enqueues its server", func(t *testing.T) {
		got := names(r.findMCPServersForSecret(ctx, secret("key", "default")))
		if len(got) != 1 || got[0] != "machine" {
			t.Errorf("got %v, want [machine]", got)
		}
	})

	// One server referencing the same Secret from both fields must be
	// enqueued once, not twice.
	t.Run("deduplicates across the two indexes", func(t *testing.T) {
		both := mcpServerWithSecrets("both", "same", "same")
		c2 := fake.NewClientBuilder().
			WithScheme(testScheme(t)).
			WithObjects(both).
			WithIndex(&arkv1alpha1.MCPServer{}, indexTokenSecretRef, mcpServerTokenSecretIndexer).
			WithIndex(&arkv1alpha1.MCPServer{}, indexSigningKeyRef, mcpServerSigningKeyIndexer).
			Build()
		got := (&MCPServerReconciler{Client: c2}).findMCPServersForSecret(ctx, secret("same", "default"))
		if len(got) != 1 {
			t.Errorf("got %d requests, want 1 (deduplicated)", len(got))
		}
	})

	t.Run("ignores Secrets nothing references", func(t *testing.T) {
		if got := r.findMCPServersForSecret(ctx, secret("nobody-cares", "default")); len(got) != 0 {
			t.Errorf("got %v, want none", got)
		}
	})

	t.Run("does not cross namespaces", func(t *testing.T) {
		got := names(r.findMCPServersForSecret(ctx, secret("shared-secret", "other-ns")))
		if len(got) != 1 || got[0] != "elsewhere" {
			t.Errorf("got %v, want [elsewhere]", got)
		}
	})
}

func names(reqs []reconcile.Request) []string {
	out := make([]string, 0, len(reqs))
	for _, r := range reqs {
		out = append(out, r.Name)
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
