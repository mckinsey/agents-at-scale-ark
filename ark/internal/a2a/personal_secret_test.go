package a2a

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/secretscope"
)

func TestResolveA2AHeadersRejectsPersonalSecret(t *testing.T) {
	scheme := runtime.NewScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(&corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "u-0123456789abcdef-a2a",
			Namespace: "default",
			Labels: map[string]string{
				secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
				secretscope.ScopeLabel:        "user-0123456789abcdef",
			},
		},
		Data: map[string][]byte{"token": []byte("personal-a2a-token")},
	}).Build()
	headers := []arkv1prealpha1.Header{{
		Name: "Authorization",
		Value: arkv1alpha1.HeaderValue{
			ValueFrom: &arkv1alpha1.HeaderValueSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "u-0123456789abcdef-a2a"},
					Key:                  "token",
				},
			},
		},
	}}

	resolved, err := resolveA2AHeaders(context.Background(), k8sClient, headers, "default")

	require.ErrorContains(t, err, secretscope.ErrPersonalSecret.Error())
	require.NotContains(t, err.Error(), "personal-a2a-token")
	require.Nil(t, resolved)
}
