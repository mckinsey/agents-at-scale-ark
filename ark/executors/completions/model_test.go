package completions

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

const defaultNamespace = "default"

func TestResolveModelSpec_NilModelSpec(t *testing.T) {
	_, _, err := ResolveModelSpec(nil, defaultNamespace)
	if err == nil || !strings.Contains(err.Error(), "model spec is nil") {
		t.Errorf("expected 'model spec is nil' error, got: %v", err)
	}
}

func TestResolveModelSpec_NilAgentModelRefPointer(t *testing.T) {
	_, _, err := ResolveModelSpec((*arkv1alpha1.AgentModelRef)(nil), defaultNamespace)
	if err == nil || !strings.Contains(err.Error(), "AgentModelRef pointer is nil") {
		t.Errorf("expected 'AgentModelRef pointer is nil' error, got: %v", err)
	}
}

func TestResolveModelSpec_ValidAgentModelRef(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec(&arkv1alpha1.AgentModelRef{
		Name:      "my-model",
		Namespace: "custom-ns",
	}, defaultNamespace)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "my-model" || namespace != "custom-ns" {
		t.Errorf("got (%q, %q), want (my-model, custom-ns)", modelName, namespace)
	}
}

func TestResolveModelSpec_AgentModelRefUsesDefaultNamespace(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec(&arkv1alpha1.AgentModelRef{Name: "my-model"}, defaultNamespace)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "my-model" || namespace != defaultNamespace {
		t.Errorf("got (%q, %q), want (my-model, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_StringModelSpec(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec("string-model", defaultNamespace)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "string-model" || namespace != defaultNamespace {
		t.Errorf("got (%q, %q), want (string-model, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_EmptyStringUsesDefaultModel(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec("", defaultNamespace)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != defaultNamespace || namespace != defaultNamespace {
		t.Errorf("got (%q, %q), want (default, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_UnsupportedType(t *testing.T) {
	_, _, err := ResolveModelSpec(123, defaultNamespace)
	if err == nil || !strings.Contains(err.Error(), "unsupported model spec type") {
		t.Errorf("expected 'unsupported model spec type' error, got: %v", err)
	}
}

func setupModelTestClient(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)
	return fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).Build()
}

func TestLoadModelCRD_ConcurrentAccess(t *testing.T) {
	name, ns := "concurrent-model", defaultNamespace
	model := &arkv1alpha1.Model{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns}}
	fakeClient := setupModelTestClient([]client.Object{model})

	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := loadModelCRD(context.Background(), fakeClient, name, ns)
			require.NoError(t, err)
			require.Equal(t, name, got.Name)
		}()
	}
	wg.Wait()
}

func TestResolveModelHeaders_DirectValue(t *testing.T) {
	headers := []arkv1alpha1.Header{
		{
			Name:  "X-Custom",
			Value: arkv1alpha1.HeaderValue{Value: "direct-value"},
		},
	}
	fakeClient := setupModelTestClient(nil)
	ctx := context.Background()

	got, err := resolveModelHeaders(ctx, fakeClient, headers, defaultNamespace)

	require.NoError(t, err)
	require.Equal(t, "direct-value", got["X-Custom"])
}

func TestResolveModelHeaders_FromSecret(t *testing.T) {
	headers := []arkv1alpha1.Header{
		{
			Name: "Authorization",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					SecretKeyRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "api-secret"},
						Key:                  "token",
					},
				},
			},
		},
	}
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "api-secret", Namespace: defaultNamespace},
		Data:       map[string][]byte{"token": []byte("secret-token")},
	}
	fakeClient := setupModelTestClient([]client.Object{secret})
	ctx := context.Background()

	got, err := resolveModelHeaders(ctx, fakeClient, headers, defaultNamespace)

	require.NoError(t, err)
	require.Equal(t, "secret-token", got["Authorization"])
}

func TestResolveModelHeaders_FromQueryParameter(t *testing.T) {
	headers := []arkv1alpha1.Header{
		{
			Name: "X-User-ID",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					QueryParameterRef: &arkv1alpha1.QueryParameterReference{Name: "userId"},
				},
			},
		},
	}
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "test-query", Namespace: defaultNamespace},
		Spec:       arkv1alpha1.QuerySpec{Parameters: []arkv1alpha1.Parameter{{Name: "userId", Value: "user-123"}}},
	}
	fakeClient := setupModelTestClient(nil)
	ctx := context.WithValue(context.Background(), QueryContextKey, query)

	got, err := resolveModelHeaders(ctx, fakeClient, headers, defaultNamespace)

	require.NoError(t, err)
	require.Equal(t, "user-123", got["X-User-ID"])
}

func TestLoadModelCRD_Found(t *testing.T) {
	name, ns := "found-model", defaultNamespace
	model := &arkv1alpha1.Model{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns}}
	fakeClient := setupModelTestClient([]client.Object{model})

	got, err := loadModelCRD(context.Background(), fakeClient, name, ns)
	require.NoError(t, err)
	require.Equal(t, name, got.Name)
}

func TestLoadModelCRD_NotFound(t *testing.T) {
	fakeClient := setupModelTestClient(nil)

	_, err := loadModelCRD(context.Background(), fakeClient, "absent-model", defaultNamespace)
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to get Model")
}

func openAIModelWithBaseURL(name, ns, baseURL string) *arkv1alpha1.Model {
	return &arkv1alpha1.Model{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns},
		Spec: arkv1alpha1.ModelSpec{
			Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
			Provider: ProviderOpenAI,
			Config: arkv1alpha1.ModelConfig{
				OpenAI: &arkv1alpha1.OpenAIModelConfig{
					BaseURL: arkv1alpha1.ValueSource{Value: baseURL},
					APIKey:  arkv1alpha1.ValueSource{Value: "sk-test"},
				},
			},
		},
	}
}

func TestLoadModel_ReflectsBaseURLUpdate(t *testing.T) {
	name, ns := "updated-model", defaultNamespace
	fakeClient := setupModelTestClient([]client.Object{openAIModelWithBaseURL(name, ns, "http://old.example.com/v1")})

	loadBaseURL := func() string {
		loaded, err := LoadModel(context.Background(), fakeClient, &arkv1alpha1.AgentModelRef{Name: name, Namespace: ns},
			ns, nil, telenoop.NewModelRecorder(), eventnoop.NewModelRecorder())
		require.NoError(t, err)
		provider, ok := loaded.Provider.(*OpenAIProvider)
		require.True(t, ok)
		return provider.BaseURL
	}

	require.Equal(t, "http://old.example.com/v1", loadBaseURL())

	var stored arkv1alpha1.Model
	require.NoError(t, fakeClient.Get(context.Background(), types.NamespacedName{Name: name, Namespace: ns}, &stored))
	stored.Spec.Config.OpenAI.BaseURL = arkv1alpha1.ValueSource{Value: "http://new.example.com/v1"}
	require.NoError(t, fakeClient.Update(context.Background(), &stored))

	require.Equal(t, "http://new.example.com/v1", loadBaseURL())
}

func TestResolveModelHeaders_QueryParameterWithoutContext(t *testing.T) {
	headers := []arkv1alpha1.Header{
		{
			Name: "X-User-ID",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					QueryParameterRef: &arkv1alpha1.QueryParameterReference{Name: "userId"},
				},
			},
		},
	}
	fakeClient := setupModelTestClient(nil)
	ctx := context.Background()

	_, err := resolveModelHeaders(ctx, fakeClient, headers, defaultNamespace)

	require.Error(t, err)
	require.Contains(t, err.Error(), "queryParameterRef requires query context")
}
