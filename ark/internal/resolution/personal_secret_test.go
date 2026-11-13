package resolution

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/secretscope"
)

const (
	personalSecretName  = "u-0123456789abcdef-github"
	personalSecretValue = "personal-token-value"
)

func personalSecretObjects() []client.Object {
	return []client.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      personalSecretName,
				Namespace: "default",
				Labels: map[string]string{
					secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
					secretscope.ScopeLabel:        "user-0123456789abcdef",
				},
			},
			Data: map[string][]byte{"token": []byte(personalSecretValue)},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "u-0123456789abcdef-promoted",
				Namespace: "default",
				Labels: map[string]string{
					secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
					secretscope.ScopeLabel:        "shared",
				},
			},
			Data: map[string][]byte{"token": []byte("shared-token")},
		},
	}
}

func secretRef(name string) *corev1.SecretKeySelector {
	return &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: name}, Key: "token"}
}

func requirePersonalRejection(t *testing.T, value string, err error) {
	t.Helper()
	require.ErrorIs(t, err, secretscope.ErrPersonalSecret)
	require.Empty(t, value)
	require.NotContains(t, err.Error(), personalSecretValue)
}

func TestResolveFromSecretRejectsPersonal(t *testing.T) {
	k8sClient := setupTestClient(personalSecretObjects())
	ctx := context.Background()

	value, err := ResolveFromSecret(ctx, k8sClient, secretRef(personalSecretName), "default")
	requirePersonalRejection(t, value, err)

	value, err = ResolveFromSecretWithAccess(ctx, k8sClient, secretRef(personalSecretName), "default", secretscope.RejectPersonal)
	requirePersonalRejection(t, value, err)
}

func TestResolveFromSecretWithAccessAllowsPersonal(t *testing.T) {
	k8sClient := setupTestClient(personalSecretObjects())

	value, err := ResolveFromSecretWithAccess(context.Background(), k8sClient, secretRef(personalSecretName), "default", secretscope.AllowPersonal)
	require.NoError(t, err)
	require.Equal(t, personalSecretValue, value)
}

func TestResolveFromSecretResolvesPromotedSecret(t *testing.T) {
	k8sClient := setupTestClient(personalSecretObjects())

	value, err := ResolveFromSecret(context.Background(), k8sClient, secretRef("u-0123456789abcdef-promoted"), "default")
	require.NoError(t, err)
	require.Equal(t, "shared-token", value)
}

func TestResolveHeaderValueRejectsPersonal(t *testing.T) {
	k8sClient := setupTestClient(personalSecretObjects())
	headerValue := arkv1alpha1.HeaderValue{
		ValueFrom: &arkv1alpha1.HeaderValueSource{SecretKeyRef: secretRef(personalSecretName)},
	}
	ctx := context.Background()

	value, err := ResolveHeaderValue(ctx, k8sClient, arkv1alpha1.Header{Name: "Authorization", Value: headerValue}, "default")
	requirePersonalRejection(t, value, err)

	value, err = ResolveHeaderValueV1PreAlpha1(ctx, k8sClient, arkv1prealpha1.Header{Name: "Authorization", Value: headerValue}, "default")
	requirePersonalRejection(t, value, err)

	headers, err := ResolveHeaders(ctx, k8sClient, []arkv1alpha1.Header{{Name: "Authorization", Value: headerValue}}, "default")
	require.ErrorIs(t, err, secretscope.ErrPersonalSecret)
	require.Nil(t, headers)

	value, err = ResolveHeaderValueWithAccess(ctx, k8sClient, arkv1alpha1.Header{Name: "Authorization", Value: headerValue}, "default", secretscope.AllowPersonal)
	require.NoError(t, err)
	require.Equal(t, personalSecretValue, value)
}

func TestResolveQueryInputTextRejectsPersonalParameter(t *testing.T) {
	k8sClient := setupTestClient(personalSecretObjects())
	query := arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "default"},
		Spec: arkv1alpha1.QuerySpec{
			Type: "user",
			Parameters: []arkv1alpha1.Parameter{{
				Name:      "token",
				ValueFrom: &arkv1alpha1.ValueFromSource{SecretKeyRef: secretRef(personalSecretName)},
			}},
		},
	}
	require.NoError(t, query.Spec.SetInputString("token is {{.token}}"))

	result, err := ResolveQueryInputText(context.Background(), query, k8sClient)
	requirePersonalRejection(t, result, err)
}

func TestResolveFromSecretRejectsPersonalBeforeLookingAtKeys(t *testing.T) {
	objects := append(personalSecretObjects(), &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "u-0123456789abcdef-empty",
			Namespace: "default",
			Labels: map[string]string{
				secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
				secretscope.ScopeLabel:        "user-0123456789abcdef",
			},
		},
	})
	k8sClient := setupTestClient(objects)
	ctx := context.Background()

	missingKey := secretRef(personalSecretName)
	missingKey.Key = "missing"
	value, err := ResolveFromSecret(ctx, k8sClient, missingKey, "default")
	requirePersonalRejection(t, value, err)
	require.NotContains(t, err.Error(), "missing")

	value, err = ResolveFromSecret(ctx, k8sClient, secretRef("u-0123456789abcdef-empty"), "default")
	requirePersonalRejection(t, value, err)
}
