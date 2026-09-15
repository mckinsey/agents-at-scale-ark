/* Copyright 2025. McKinsey & Company */

package mcp

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	testAuthNamespace  = "mcp-ns"
	testAuthSecretName = "mcp-token"
)

func newAuthTestReader(objects ...client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)

	return fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).Build()
}

func newAuthTestMCPServer(ref *arkv1alpha1.TokenSecretReference) *arkv1alpha1.MCPServer {
	server := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: "test-server", Namespace: testAuthNamespace},
	}
	if ref != nil {
		server.Spec.Authorization = &arkv1alpha1.MCPServerAuthorizationSpec{TokenSecretRef: *ref}
	}
	return server
}

func newAuthTestSecret(data map[string][]byte) *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: testAuthSecretName, Namespace: testAuthNamespace},
		Data:       data,
	}
}

func TestResolveAuthorizationMaterialNilSpecNeverReadsSecret(t *testing.T) {
	material, warnings, err := ResolveAuthorizationMaterial(context.Background(), nil, newAuthTestMCPServer(nil))

	require.NoError(t, err)
	assert.Nil(t, material)
	assert.Empty(t, warnings)
}

func TestResolveAuthorizationMaterialDefaultKeys(t *testing.T) {
	secret := newAuthTestSecret(map[string][]byte{
		arkv1alpha1.DefaultAccessTokenKey: []byte("tok-abc"),
		arkv1alpha1.DefaultExpiresAtKey:   []byte("2030-01-02T03:04:05Z"),
	})
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{Name: testAuthSecretName})

	material, warnings, err := ResolveAuthorizationMaterial(context.Background(), newAuthTestReader(secret), server)

	require.NoError(t, err)
	require.NotNil(t, material)
	assert.Equal(t, "tok-abc", material.AccessToken)
	require.NotNil(t, material.ExpiresAt)
	assert.Equal(t, 2030, material.ExpiresAt.Year())
	assert.Empty(t, warnings)
}

func TestResolveAuthorizationMaterialCustomKeys(t *testing.T) {
	secret := newAuthTestSecret(map[string][]byte{
		"MY_TOKEN":                        []byte("tok-custom"),
		"MY_EXPIRY":                       []byte("2031-06-07T08:09:10Z"),
		arkv1alpha1.DefaultAccessTokenKey: []byte("tok-default-must-be-ignored"),
	})
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{
		Name:           testAuthSecretName,
		AccessTokenKey: "MY_TOKEN",
		ExpiresAtKey:   "MY_EXPIRY",
	})

	material, warnings, err := ResolveAuthorizationMaterial(context.Background(), newAuthTestReader(secret), server)

	require.NoError(t, err)
	require.NotNil(t, material)
	assert.Equal(t, "tok-custom", material.AccessToken)
	require.NotNil(t, material.ExpiresAt)
	assert.Equal(t, 2031, material.ExpiresAt.Year())
	assert.Empty(t, warnings)
}

func TestResolveAuthorizationMaterialSecretNotFound(t *testing.T) {
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{Name: testAuthSecretName})

	material, warnings, err := ResolveAuthorizationMaterial(context.Background(), newAuthTestReader(), server)

	require.NoError(t, err)
	require.NotNil(t, material)
	assert.Empty(t, material.AccessToken)
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], testAuthSecretName)
	assert.Contains(t, warnings[0], testAuthNamespace)
	assert.Contains(t, warnings[0], "spec.authorization.tokenSecretRef.name")
}

func TestResolveAuthorizationMaterialOverriddenKeyWarnings(t *testing.T) {
	tests := []struct {
		name         string
		ref          arkv1alpha1.TokenSecretReference
		secretData   map[string][]byte
		wantWarnings []string
	}{
		{
			name:         "empty secret with default keys stays silent",
			ref:          arkv1alpha1.TokenSecretReference{Name: testAuthSecretName},
			secretData:   map[string][]byte{},
			wantWarnings: nil,
		},
		{
			name: "explicit default key values stay silent",
			ref: arkv1alpha1.TokenSecretReference{
				Name:            testAuthSecretName,
				AccessTokenKey:  arkv1alpha1.DefaultAccessTokenKey,
				RefreshTokenKey: arkv1alpha1.DefaultRefreshTokenKey,
				ExpiresAtKey:    arkv1alpha1.DefaultExpiresAtKey,
				ClientIDKey:     arkv1alpha1.DefaultClientIDKey,
				ClientSecretKey: arkv1alpha1.DefaultClientSecretKey,
			},
			secretData:   map[string][]byte{},
			wantWarnings: nil,
		},
		{
			name: "overridden and absent key warns",
			ref: arkv1alpha1.TokenSecretReference{
				Name:           testAuthSecretName,
				AccessTokenKey: "MY_CUSTOM_ACCESS_TOKEN",
			},
			secretData:   map[string][]byte{},
			wantWarnings: []string{"MY_CUSTOM_ACCESS_TOKEN"},
		},
		{
			name: "overridden and present key stays silent",
			ref: arkv1alpha1.TokenSecretReference{
				Name:           testAuthSecretName,
				AccessTokenKey: "MY_CUSTOM_ACCESS_TOKEN",
			},
			secretData:   map[string][]byte{"MY_CUSTOM_ACCESS_TOKEN": []byte("tok")},
			wantWarnings: nil,
		},
		{
			name: "each absent override warns in field order",
			ref: arkv1alpha1.TokenSecretReference{
				Name:            testAuthSecretName,
				AccessTokenKey:  "A_KEY",
				ClientSecretKey: "CS_KEY",
			},
			secretData:   map[string][]byte{},
			wantWarnings: []string{"A_KEY", "CS_KEY"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newAuthTestMCPServer(&tt.ref)
			reader := newAuthTestReader(newAuthTestSecret(tt.secretData))

			_, warnings, err := ResolveAuthorizationMaterial(context.Background(), reader, server)

			require.NoError(t, err)
			require.Len(t, warnings, len(tt.wantWarnings))
			for i, want := range tt.wantWarnings {
				assert.Contains(t, warnings[i], want)
				assert.Contains(t, warnings[i], "was overridden")
			}
		})
	}
}

func TestResolveAuthorizationMaterialUnparseableExpiresAt(t *testing.T) {
	secret := newAuthTestSecret(map[string][]byte{
		arkv1alpha1.DefaultAccessTokenKey: []byte("tok-abc"),
		arkv1alpha1.DefaultExpiresAtKey:   []byte("not-a-timestamp"),
	})
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{Name: testAuthSecretName})

	material, warnings, err := ResolveAuthorizationMaterial(context.Background(), newAuthTestReader(secret), server)

	require.NoError(t, err)
	require.NotNil(t, material)
	assert.Equal(t, "tok-abc", material.AccessToken)
	assert.Nil(t, material.ExpiresAt)
	assert.Empty(t, warnings, "an unparseable expiry is logged, not surfaced as an operator warning")
}

func TestResolveAuthorizationMaterialTrimsExpiresAtWhitespace(t *testing.T) {
	secret := newAuthTestSecret(map[string][]byte{
		arkv1alpha1.DefaultAccessTokenKey: []byte("tok-abc"),
		arkv1alpha1.DefaultExpiresAtKey:   []byte("  2030-01-02T03:04:05Z\n"),
	})
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{Name: testAuthSecretName})

	material, _, err := ResolveAuthorizationMaterial(context.Background(), newAuthTestReader(secret), server)

	require.NoError(t, err)
	require.NotNil(t, material.ExpiresAt)
	assert.Equal(t, 2030, material.ExpiresAt.Year())
}

func TestResolveAuthorizationMaterialTrimsAccessTokenWhitespace(t *testing.T) {
	secret := newAuthTestSecret(map[string][]byte{
		arkv1alpha1.DefaultAccessTokenKey: []byte("  tok-abc\n"),
	})
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{Name: testAuthSecretName})

	material, _, err := ResolveAuthorizationMaterial(context.Background(), newAuthTestReader(secret), server)

	require.NoError(t, err)
	require.NotNil(t, material)
	assert.Equal(t, "tok-abc", material.AccessToken)
}

func TestResolveAuthorizationMaterialGetErrorPropagates(t *testing.T) {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)

	reader := fake.NewClientBuilder().WithScheme(scheme).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(_ context.Context, _ client.WithWatch, _ client.ObjectKey, _ client.Object, _ ...client.GetOption) error {
				return apierrors.NewForbidden(schema.GroupResource{Resource: "secrets"}, testAuthSecretName, assert.AnError)
			},
		}).Build()
	server := newAuthTestMCPServer(&arkv1alpha1.TokenSecretReference{Name: testAuthSecretName})

	material, warnings, err := ResolveAuthorizationMaterial(context.Background(), reader, server)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to read authorization secret")
	assert.Nil(t, material)
	assert.Empty(t, warnings)
}

func TestApplyBearer(t *testing.T) {
	tests := []struct {
		name     string
		material *AuthorizationMaterial
		headers  map[string]string
		want     map[string]string
	}{
		{
			name:     "nil material leaves headers untouched",
			material: nil,
			headers:  map[string]string{"X-Org": "acme"},
			want:     map[string]string{"X-Org": "acme"},
		},
		{
			name:     "empty token leaves headers untouched",
			material: &AuthorizationMaterial{},
			headers:  map[string]string{"X-Org": "acme"},
			want:     map[string]string{"X-Org": "acme"},
		},
		{
			name:     "token is injected as a bearer",
			material: &AuthorizationMaterial{AccessToken: "tok-abc"},
			headers:  map[string]string{"X-Org": "acme"},
			want:     map[string]string{"X-Org": "acme", "Authorization": "Bearer tok-abc"},
		},
		{
			name:     "token overwrites an Authorization header from spec.headers",
			material: &AuthorizationMaterial{AccessToken: "tok-abc"},
			headers:  map[string]string{"Authorization": "Bearer stale"},
			want:     map[string]string{"Authorization": "Bearer tok-abc"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.material.ApplyBearer(tt.headers)
			assert.Equal(t, tt.want, tt.headers)
		})
	}
}
