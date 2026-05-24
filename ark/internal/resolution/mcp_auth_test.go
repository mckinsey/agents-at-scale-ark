/* Copyright 2025. McKinsey & Company */

package resolution

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func newAuthScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	s := runtime.NewScheme()
	require.NoError(t, corev1.AddToScheme(s))
	require.NoError(t, arkv1alpha1.AddToScheme(s))
	return s
}

func TestResolveBearerToken(t *testing.T) {
	ctx := context.Background()

	// Helper to build an MCPServer with the given Authorization spec.
	mkServer := func(auth *arkv1alpha1.MCPServerAuthorizationSpec) *arkv1alpha1.MCPServer {
		return &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "srv", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:       arkv1alpha1.ValueSource{Value: "http://example/mcp"},
				Authorization: auth,
			},
		}
	}

	t.Run("nil authorization returns empty without API call", func(t *testing.T) {
		c := fake.NewClientBuilder().WithScheme(newAuthScheme(t)).Build()
		token, err := ResolveBearerToken(ctx, c, mkServer(nil))
		require.NoError(t, err)
		assert.Empty(t, token)
	})

	t.Run("missing secret returns empty for fall-through to 401 path", func(t *testing.T) {
		c := fake.NewClientBuilder().WithScheme(newAuthScheme(t)).Build()
		srv := mkServer(&arkv1alpha1.MCPServerAuthorizationSpec{
			TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "missing"},
		})
		token, err := ResolveBearerToken(ctx, c, srv)
		require.NoError(t, err)
		assert.Empty(t, token)
	})

	t.Run("default access_token key is read", func(t *testing.T) {
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "s", Namespace: "default"},
			Data:       map[string][]byte{"access_token": []byte("abc123")},
		}
		c := fake.NewClientBuilder().WithScheme(newAuthScheme(t)).WithObjects(secret).Build()
		srv := mkServer(&arkv1alpha1.MCPServerAuthorizationSpec{
			TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "s"},
		})
		token, err := ResolveBearerToken(ctx, c, srv)
		require.NoError(t, err)
		assert.Equal(t, "abc123", token)
	})

	t.Run("custom accessTokenKey override is honoured", func(t *testing.T) {
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "s", Namespace: "default"},
			Data:       map[string][]byte{"MY_TOKEN": []byte("override-value")},
		}
		c := fake.NewClientBuilder().WithScheme(newAuthScheme(t)).WithObjects(secret).Build()
		srv := mkServer(&arkv1alpha1.MCPServerAuthorizationSpec{
			TokenSecretRef: arkv1alpha1.TokenSecretReference{
				Name:           "s",
				AccessTokenKey: "MY_TOKEN",
			},
		})
		token, err := ResolveBearerToken(ctx, c, srv)
		require.NoError(t, err)
		assert.Equal(t, "override-value", token)
	})

	t.Run("empty access_token value returns empty (shell secret state)", func(t *testing.T) {
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "s", Namespace: "default"},
			Data:       map[string][]byte{"access_token": {}},
		}
		c := fake.NewClientBuilder().WithScheme(newAuthScheme(t)).WithObjects(secret).Build()
		srv := mkServer(&arkv1alpha1.MCPServerAuthorizationSpec{
			TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "s"},
		})
		token, err := ResolveBearerToken(ctx, c, srv)
		require.NoError(t, err)
		assert.Empty(t, token)
	})
}
