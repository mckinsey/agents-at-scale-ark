/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/secretscope"
)

func TestReadSigningKeyRejectsPersonalSecret(t *testing.T) {
	scheme := runtime.NewScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	keySecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "u-0123456789abcdef-signing-key",
			Namespace: "default",
			Labels: map[string]string{
				secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
				secretscope.ScopeLabel:        "user-0123456789abcdef",
			},
		},
		Data: map[string][]byte{"private.pem": []byte("personal-private-key")},
	}
	r := &MCPServerReconciler{APIReader: fake.NewClientBuilder().WithScheme(scheme).WithObjects(keySecret).Build()}
	mcpServer := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: "machine", Namespace: "default"},
		Spec: arkv1alpha1.MCPServerSpec{
			Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
				ClientCredentials: &arkv1alpha1.ClientCredentialsSpec{
					ClientAuthentication: arkv1alpha1.ClientAuthenticationSpec{
						PrivateKeyJWT: &arkv1alpha1.PrivateKeyJWTSpec{
							SecretKeyRef: arkv1alpha1.SigningKeySecretKeyRef{Name: keySecret.Name},
						},
					},
				},
			},
		},
	}

	pem, err := r.readSigningKey(context.Background(), mcpServer)

	require.ErrorIs(t, err, secretscope.ErrPersonalSecret)
	require.Nil(t, pem)
	require.NotContains(t, err.Error(), "personal-private-key")
}
