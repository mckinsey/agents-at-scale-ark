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

func newTestScheme() *runtime.Scheme {
	scheme := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(scheme)
	_ = corev1.AddToScheme(scheme)
	return scheme
}

func TestResolveQueryInputText(t *testing.T) {
	t.Run("user type with string input", func(t *testing.T) {
		inputBytes, _ := json.Marshal("hello world")
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q1", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Input: runtime.RawExtension{Raw: inputBytes},
			},
		}
		k8s := fake.NewClientBuilder().WithScheme(newTestScheme()).Build()
		text, err := ResolveQueryInputText(context.Background(), query, k8s)
		require.NoError(t, err)
		assert.Equal(t, "hello world", text)
	})

	t.Run("explicit user type", func(t *testing.T) {
		inputBytes, _ := json.Marshal("explicit user")
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q2", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Type:  arkv1alpha1.QueryTypeUser,
				Input: runtime.RawExtension{Raw: inputBytes},
			},
		}
		k8s := fake.NewClientBuilder().WithScheme(newTestScheme()).Build()
		text, err := ResolveQueryInputText(context.Background(), query, k8s)
		require.NoError(t, err)
		assert.Equal(t, "explicit user", text)
	})

	t.Run("messages type extracts first user content", func(t *testing.T) {
		messages := []map[string]string{
			{"role": "system", "content": "you are helpful"},
			{"role": "user", "content": "what is 2+2"},
		}
		inputBytes, _ := json.Marshal(messages)
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q3", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Type:  arkv1alpha1.QueryTypeMessages,
				Input: runtime.RawExtension{Raw: inputBytes},
			},
		}
		k8s := fake.NewClientBuilder().WithScheme(newTestScheme()).Build()
		text, err := ResolveQueryInputText(context.Background(), query, k8s)
		require.NoError(t, err)
		assert.Equal(t, "what is 2+2", text)
	})

	t.Run("messages type with no user message returns empty", func(t *testing.T) {
		messages := []map[string]string{
			{"role": "system", "content": "you are helpful"},
		}
		inputBytes, _ := json.Marshal(messages)
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q4", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Type:  arkv1alpha1.QueryTypeMessages,
				Input: runtime.RawExtension{Raw: inputBytes},
			},
		}
		k8s := fake.NewClientBuilder().WithScheme(newTestScheme()).Build()
		text, err := ResolveQueryInputText(context.Background(), query, k8s)
		require.NoError(t, err)
		assert.Empty(t, text)
	})

	t.Run("user type with parameters resolves template", func(t *testing.T) {
		inputBytes, _ := json.Marshal("hello {{.name}}")
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q5", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Input: runtime.RawExtension{Raw: inputBytes},
				Parameters: []arkv1alpha1.Parameter{
					{Name: "name", Value: "world"},
				},
			},
		}
		k8s := fake.NewClientBuilder().WithScheme(newTestScheme()).Build()
		text, err := ResolveQueryInputText(context.Background(), query, k8s)
		require.NoError(t, err)
		assert.Equal(t, "hello world", text)
	})

	t.Run("unsupported type returns error", func(t *testing.T) {
		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "q6", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Type: "unsupported",
			},
		}
		k8s := fake.NewClientBuilder().WithScheme(newTestScheme()).Build()
		_, err := ResolveQueryInputText(context.Background(), query, k8s)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported query type")
	})
}

func TestExtractFirstUserText(t *testing.T) {
	t.Run("returns first user message text", func(t *testing.T) {
		messages := []map[string]string{
			{"role": "user", "content": "first"},
			{"role": "user", "content": "second"},
		}
		raw, _ := json.Marshal(messages)
		text, err := extractFirstUserText(raw)
		require.NoError(t, err)
		assert.Equal(t, "first", text)
	})

	t.Run("skips non-user messages", func(t *testing.T) {
		messages := []map[string]string{
			{"role": "assistant", "content": "hi"},
			{"role": "user", "content": "found me"},
		}
		raw, _ := json.Marshal(messages)
		text, err := extractFirstUserText(raw)
		require.NoError(t, err)
		assert.Equal(t, "found me", text)
	})

	t.Run("invalid json returns error", func(t *testing.T) {
		_, err := extractFirstUserText([]byte("not json"))
		require.Error(t, err)
	})
}
