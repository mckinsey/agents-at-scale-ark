package resolution

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResolveQueryInputText(t *testing.T) {
	ctx := context.Background()
	scheme := runtime.NewScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))

	t.Run("plain text input", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
			Spec:       arkv1alpha1.QuerySpec{Type: "user"},
		}
		require.NoError(t, query.Spec.SetInputString("hello"))

		result, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.NoError(t, err)
		assert.Equal(t, "hello", result)
	})

	t.Run("empty type defaults to user", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
		}
		require.NoError(t, query.Spec.SetInputString("default"))

		result, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.NoError(t, err)
		assert.Equal(t, "default", result)
	})

	t.Run("template with ConfigMap parameter", func(t *testing.T) {
		cm := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: "cfg", Namespace: "ns"},
			Data:       map[string]string{"city": "Berlin"},
		}
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(cm).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
				Parameters: []arkv1alpha1.Parameter{{
					Name: "city",
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "cfg"},
							Key:                  "city",
						},
					},
				}},
			},
		}
		require.NoError(t, query.Spec.SetInputString("Weather in {{.city}}?"))

		result, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.NoError(t, err)
		assert.Equal(t, "Weather in Berlin?", result)
	})

	t.Run("template with Secret parameter", func(t *testing.T) {
		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "sec", Namespace: "ns"},
			Data:       map[string][]byte{"token": []byte("abc123")},
		}
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(secret).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
				Parameters: []arkv1alpha1.Parameter{{
					Name: "token",
					ValueFrom: &arkv1alpha1.ValueFromSource{
						SecretKeyRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "sec"},
							Key:                  "token",
						},
					},
				}},
			},
		}
		require.NoError(t, query.Spec.SetInputString("auth: {{.token}}"))

		result, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.NoError(t, err)
		assert.Equal(t, "auth: abc123", result)
	})

	t.Run("inline parameter value", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
				Parameters: []arkv1alpha1.Parameter{{
					Name:  "name",
					Value: "Alice",
				}},
			},
		}
		require.NoError(t, query.Spec.SetInputString("Hello {{.name}}"))

		result, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.NoError(t, err)
		assert.Equal(t, "Hello Alice", result)
	})

	t.Run("missing ConfigMap returns error", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
				Parameters: []arkv1alpha1.Parameter{{
					Name: "x",
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "missing"},
							Key:                  "k",
						},
					},
				}},
			},
		}
		require.NoError(t, query.Spec.SetInputString("{{.x}}"))

		_, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to resolve parameter")
	})

	t.Run("parameter without value or valueFrom returns error", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q", Namespace: "ns"},
			Spec: arkv1alpha1.QuerySpec{
				Type:       "user",
				Parameters: []arkv1alpha1.Parameter{{Name: "empty"}},
			},
		}
		require.NoError(t, query.Spec.SetInputString("{{.empty}}"))

		_, err := ResolveQueryInputText(ctx, query, k8sClient)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "must specify either value or valueFrom")
	})
}

func TestExtractFirstUserText(t *testing.T) {
	t.Run("string content", func(t *testing.T) {
		raw := json.RawMessage(`[{"role":"system","content":"sys"},{"role":"user","content":"hello"}]`)
		text, err := ExtractFirstUserText(raw)
		require.NoError(t, err)
		assert.Equal(t, "hello", text)
	})

	t.Run("last user message wins", func(t *testing.T) {
		raw := json.RawMessage(`[{"role":"user","content":"first"},{"role":"assistant","content":"reply"},{"role":"user","content":"second"}]`)
		text, err := ExtractFirstUserText(raw)
		require.NoError(t, err)
		assert.Equal(t, "second", text)
	})

	t.Run("array-of-parts content", func(t *testing.T) {
		raw := json.RawMessage(`[{"role":"user","content":[{"type":"text","text":"from parts"}]}]`)
		text, err := ExtractFirstUserText(raw)
		require.NoError(t, err)
		assert.Equal(t, "from parts", text)
	})

	t.Run("no user message returns error", func(t *testing.T) {
		raw := json.RawMessage(`[{"role":"assistant","content":"hi"}]`)
		_, err := ExtractFirstUserText(raw)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no user message found")
	})

	t.Run("empty array returns error", func(t *testing.T) {
		raw := json.RawMessage(`[]`)
		_, err := ExtractFirstUserText(raw)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "no user message found")
	})

	t.Run("invalid JSON returns error", func(t *testing.T) {
		raw := json.RawMessage(`not json`)
		_, err := ExtractFirstUserText(raw)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to parse messages array")
	})
}
