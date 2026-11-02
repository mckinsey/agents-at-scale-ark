/* Copyright 2025. McKinsey & Company */

package common

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/secretscope"
)

func newResolverTestClient() client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	secret := func(name string, labels map[string]string, value string) *corev1.Secret {
		return &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default", Labels: labels},
			Data:       map[string][]byte{"token": []byte(value)},
		}
	}
	return fake.NewClientBuilder().WithScheme(scheme).WithObjects(
		secret("u-0123456789abcdef-github", map[string]string{
			secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
			secretscope.ScopeLabel:        "user-0123456789abcdef",
		}, "personal-token-value"),
		secret("shared-github", map[string]string{
			secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
			secretscope.ScopeLabel:        "shared",
		}, "shared-token"),
		secret("legacy-github", nil, "legacy-token"),
	).Build()
}

func tokenKeyRef(name string) *corev1.SecretKeySelector {
	return &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: name}, Key: "token"}
}

func TestValueSourceResolversRejectPersonalSecrets(t *testing.T) {
	k8sClient := newResolverTestClient()
	ctx := context.Background()
	resolvers := map[string]func(name string) (string, error){
		"v1alpha1": func(name string) (string, error) {
			return NewValueSourceResolver(k8sClient).ResolveValueSource(ctx, arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{SecretKeyRef: tokenKeyRef(name)}}, "default")
		},
		"v1prealpha1": func(name string) (string, error) {
			return NewValueSourceResolverV1PreAlpha1(k8sClient).ResolveValueSource(ctx, arkv1prealpha1.ValueSource{ValueFrom: &arkv1prealpha1.ValueFromSource{SecretKeyRef: tokenKeyRef(name)}}, "default")
		},
	}

	for version, resolve := range resolvers {
		t.Run(version, func(t *testing.T) {
			value, err := resolve("u-0123456789abcdef-github")
			require.ErrorIs(t, err, secretscope.ErrPersonalSecret)
			require.Empty(t, value)
			require.NotContains(t, err.Error(), "personal-token-value")

			value, err = resolve("shared-github")
			require.NoError(t, err)
			require.Equal(t, "shared-token", value)

			value, err = resolve("legacy-github")
			require.NoError(t, err)
			require.Equal(t, "legacy-token", value)
		})
	}
}
