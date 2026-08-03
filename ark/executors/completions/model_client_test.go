package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

func TestModelCachingClient_ServesModelReadsFromCache(t *testing.T) {
	name, ns := "routed-model", defaultNamespace
	cached := setupModelTestClient([]client.Object{openAIModelWithBaseURL(name, ns, "http://from-cache/v1")})
	direct := setupModelTestClient([]client.Object{openAIModelWithBaseURL(name, ns, "http://from-direct/v1")})

	routed := &modelCachingClient{Client: direct, models: cached}

	var got arkv1alpha1.Model
	require.NoError(t, routed.Get(context.Background(), types.NamespacedName{Name: name, Namespace: ns}, &got))
	require.Equal(t, "http://from-cache/v1", got.Spec.Config.OpenAI.BaseURL.Value)
}

func TestModelCachingClient_ServesOtherReadsFromDirectClient(t *testing.T) {
	ns := defaultNamespace
	inDirect := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "direct-secret", Namespace: ns}}
	inCache := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "cache-secret", Namespace: ns}}

	routed := &modelCachingClient{
		Client: setupModelTestClient([]client.Object{inDirect}),
		models: setupModelTestClient([]client.Object{inCache}),
	}

	var found corev1.Secret
	require.NoError(t, routed.Get(context.Background(), types.NamespacedName{Name: "direct-secret", Namespace: ns}, &found))

	var missing corev1.Secret
	err := routed.Get(context.Background(), types.NamespacedName{Name: "cache-secret", Namespace: ns}, &missing)
	require.True(t, apierrors.IsNotFound(err), "non-Model reads must not be served by the Model cache")
}

func TestLoadModel_UsesCachedModelReader(t *testing.T) {
	name, ns := "cached-reader-model", defaultNamespace
	routed := &modelCachingClient{
		Client: setupModelTestClient(nil),
		models: setupModelTestClient([]client.Object{openAIModelWithBaseURL(name, ns, "http://from-cache/v1")}),
	}

	loaded, err := LoadModel(context.Background(), routed, &arkv1alpha1.AgentModelRef{Name: name, Namespace: ns},
		ns, nil, telenoop.NewModelRecorder(), eventnoop.NewModelRecorder())
	require.NoError(t, err)

	provider, ok := loaded.Provider.(*OpenAIProvider)
	require.True(t, ok)
	require.Equal(t, "http://from-cache/v1", provider.BaseURL)
}
