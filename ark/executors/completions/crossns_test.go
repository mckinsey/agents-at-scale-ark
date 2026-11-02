package completions

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/crossns"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

const (
	refSourceNamespace = "tenant-a"
	refTargetNamespace = "tenant-b"
)

func crossNamespaceModel(name string, annotations map[string]string) *arkv1alpha1.Model {
	return &arkv1alpha1.Model{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: refTargetNamespace, Annotations: annotations},
		Spec: arkv1alpha1.ModelSpec{
			Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
			Provider: ProviderOpenAI,
			Config: arkv1alpha1.ModelConfig{
				OpenAI: &arkv1alpha1.OpenAIModelConfig{
					BaseURL: arkv1alpha1.ValueSource{Value: "http://model.example.com/v1"},
					APIKey: arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{
						SecretKeyRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "model-key"},
							Key:                  "token",
						},
					}},
				},
			},
		},
	}
}

func crossNamespaceClient(secretReads *atomic.Int32, objects ...client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)
	objects = append(objects, &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "model-key", Namespace: refTargetNamespace},
		Data:       map[string][]byte{"token": []byte("value")},
	})
	return fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objects...).
		WithStatusSubresource(&arkv1alpha1.Memory{}).
		WithInterceptorFuncs(interceptor.Funcs{
			Get: func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
				if _, ok := obj.(*corev1.Secret); ok {
					secretReads.Add(1)
				}
				return c.Get(ctx, key, obj, opts...)
			},
		}).
		Build()
}

func TestLoadModelCrossNamespace(t *testing.T) {
	cases := []struct {
		name        string
		modelName   string
		annotations map[string]string
		create      bool
		wantDenied  bool
	}{
		{name: "denied without annotation", modelName: "closed", create: true, wantDenied: true},
		{name: "denied when the list omits the source namespace", modelName: "other", create: true, annotations: map[string]string{crossns.AllowedNamespacesAnnotation: "tenant-c"}, wantDenied: true},
		{name: "denied with the same message when the model is missing", modelName: "missing", wantDenied: true},
		{name: "allowed with wildcard", modelName: "wildcard", create: true, annotations: map[string]string{crossns.AllowedNamespacesAnnotation: "*"}},
		{name: "allowed when listed", modelName: "listed", create: true, annotations: map[string]string{crossns.AllowedNamespacesAnnotation: "tenant-c,tenant-a"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var secretReads atomic.Int32
			var objects []client.Object
			if tc.create {
				objects = append(objects, crossNamespaceModel(tc.modelName, tc.annotations))
			}
			k8sClient := crossNamespaceClient(&secretReads, objects...)

			model, err := LoadModel(context.Background(), k8sClient,
				&arkv1alpha1.AgentModelRef{Name: tc.modelName, Namespace: refTargetNamespace},
				refSourceNamespace, nil, telenoop.NewModelRecorder(), eventnoop.NewModelRecorder())

			if tc.wantDenied {
				require.EqualError(t, err, crossns.DeniedError("Model", refTargetNamespace, tc.modelName, refSourceNamespace).Error())
				require.Nil(t, model)
				require.Zero(t, secretReads.Load(), "the target Secret must not be read")
				return
			}
			require.NoError(t, err)
			require.NotNil(t, model)
		})
	}
}

func TestLoadModelSameNamespaceIgnoresAnnotation(t *testing.T) {
	var secretReads atomic.Int32
	model := crossNamespaceModel("local", nil)
	model.Namespace = refSourceNamespace
	k8sClient := crossNamespaceClient(&secretReads, model, &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "model-key", Namespace: refSourceNamespace},
		Data:       map[string][]byte{"token": []byte("value")},
	})

	for _, ref := range []*arkv1alpha1.AgentModelRef{
		{Name: "local"},
		{Name: "local", Namespace: refSourceNamespace},
	} {
		loaded, err := LoadModel(context.Background(), k8sClient, ref, refSourceNamespace, nil, telenoop.NewModelRecorder(), eventnoop.NewModelRecorder())
		require.NoError(t, err)
		require.NotNil(t, loaded)
	}
}

func TestNewMemoryForQueryCrossNamespace(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"conversation_id":"conv-1"}`))
	}))
	defer server.Close()
	address := server.URL

	memoryIn := func(namespace, name string, annotations map[string]string) *arkv1alpha1.Memory {
		return &arkv1alpha1.Memory{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace, Annotations: annotations},
			Spec:       arkv1alpha1.MemorySpec{Address: arkv1alpha1.ValueSource{Value: server.URL}},
			Status:     arkv1alpha1.MemoryStatus{LastResolvedAddress: &address, Phase: "ready"},
		}
	}

	k8sClient := setupMemoryTestClient([]client.Object{
		memoryIn(refTargetNamespace, "closed", nil),
		memoryIn(refTargetNamespace, "other", map[string]string{crossns.AllowedNamespacesAnnotation: "tenant-c"}),
		memoryIn(refTargetNamespace, "wildcard", map[string]string{crossns.AllowedNamespacesAnnotation: "*"}),
		memoryIn(refTargetNamespace, "listed", map[string]string{crossns.AllowedNamespacesAnnotation: "tenant-a, tenant-c"}),
		memoryIn(refSourceNamespace, "local", nil),
	})

	newMemory := func(ref *arkv1alpha1.MemoryRef) (MemoryInterface, error) {
		return NewMemoryForQuery(context.Background(), k8sClient, ref, refSourceNamespace, "", "q", nil, &noOpMemoryRecorder{})
	}

	for _, name := range []string{"closed", "other", "missing"} {
		t.Run("denied "+name, func(t *testing.T) {
			calls.Store(0)
			mem, err := newMemory(&arkv1alpha1.MemoryRef{Name: name, Namespace: refTargetNamespace})
			require.EqualError(t, err, crossns.DeniedError("Memory", refTargetNamespace, name, refSourceNamespace).Error())
			require.Nil(t, mem)
			require.Zero(t, calls.Load(), "the memory backend must not be contacted")
		})
	}

	for _, name := range []string{"wildcard", "listed"} {
		t.Run("allowed "+name, func(t *testing.T) {
			mem, err := newMemory(&arkv1alpha1.MemoryRef{Name: name, Namespace: refTargetNamespace})
			require.NoError(t, err)
			_, ok := mem.(*HTTPMemory)
			require.True(t, ok)
		})
	}

	t.Run("same namespace needs no annotation", func(t *testing.T) {
		for _, ref := range []*arkv1alpha1.MemoryRef{{Name: "local"}, {Name: "local", Namespace: refSourceNamespace}} {
			mem, err := newMemory(ref)
			require.NoError(t, err)
			_, ok := mem.(*HTTPMemory)
			require.True(t, ok)
		}
	})
}
