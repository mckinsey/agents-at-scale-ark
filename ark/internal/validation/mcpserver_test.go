//nolint:goconst
package validation

import (
	"context"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateMCPServer(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid mcpserver with direct address", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unresolvable address", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates headers", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1alpha1.Header{{Name: "", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error for header without name")
		}
	})

	t.Run("rejects negative poll interval", func(t *testing.T) {
		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:      arkv1alpha1.ValueSource{Value: "http://localhost"},
				PollInterval: &metav1.Duration{Duration: -1 * time.Second},
			},
		}
		_, err := v.ValidateMCPServer(ctx, mcp)
		if err == nil {
			t.Fatal("expected error for negative poll interval")
		}
	})
}

func TestValidateMCPServerClientCredentials(t *testing.T) {
	ctx := context.Background()
	v := NewValidator(newMockLookup())

	build := func(tokenEndpoint string) *arkv1alpha1.MCPServer {
		return &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "m", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{Value: "https://mcp.example.com/mcp"},
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "tok"},
					ClientCredentials: &arkv1alpha1.ClientCredentialsSpec{
						ClientID:      "ark-client",
						TokenEndpoint: tokenEndpoint,
						ClientAuthentication: arkv1alpha1.ClientAuthenticationSpec{
							PrivateKeyJWT: &arkv1alpha1.PrivateKeyJWTSpec{
								SecretKeyRef: arkv1alpha1.SigningKeySecretKeyRef{Name: "key", Key: "private.pem"},
								Algorithm:    "ES256",
							},
						},
					},
				},
			},
		}
	}

	// The client assertion is a replayable credential in flight and the
	// issued token returns on the same channel, so plaintext is refused
	// except on loopback, where OAuth 2.1 and MCP Authorization allow it
	// for development.
	accepted := []string{
		"https://auth.example.com/token",
		"http://localhost:8090/realms/ark/protocol/openid-connect/token",
		"http://127.0.0.1:8090/token",
		"http://[::1]:8090/token",
	}
	for _, ep := range accepted {
		if _, err := v.ValidateMCPServer(ctx, build(ep)); err != nil {
			t.Errorf("tokenEndpoint %q should be accepted, got %v", ep, err)
		}
	}

	rejected := []string{
		"http://auth.example.com/token",
		"http://10.0.0.5:8080/token",
		"http://keycloak.default.svc:8080/token",
	}
	for _, ep := range rejected {
		if _, err := v.ValidateMCPServer(ctx, build(ep)); err == nil {
			t.Errorf("plaintext tokenEndpoint %q should be rejected", ep)
		}
	}

	t.Run("rejects a blank clientID", func(t *testing.T) {
		s := build("https://auth.example.com/token")
		s.Spec.Authorization.ClientCredentials.ClientID = "  "
		if _, err := v.ValidateMCPServer(ctx, s); err == nil {
			t.Error("expected an error for a blank clientID")
		}
	})
}
