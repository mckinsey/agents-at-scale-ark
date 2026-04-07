package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestGetQueryInputMessages(t *testing.T) {
	ctx := context.Background()
	scheme := runtime.NewScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))

	t.Run("user type with simple input", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
			},
		}

		// Set the input using the RawExtension helper
		err := query.Spec.SetInputString("Hello, how are you?")
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 1)

		// Check that it's a user message
		assert.NotNil(t, messages[0].OfUser)
		assert.Equal(t, "Hello, how are you?", messages[0].OfUser.Content.OfString.Value)
	})

	t.Run("user type with template parameters", func(t *testing.T) {
		// Create a ConfigMap for parameter resolution
		configMap := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-config",
				Namespace: "test-ns",
			},
			Data: map[string]string{
				"location": "Berlin",
			},
		}

		k8sClient := fake.NewClientBuilder().
			WithScheme(scheme).
			WithObjects(configMap).
			Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "location",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "test-config",
								},
								Key: "location",
							},
						},
					},
				},
			},
		}

		// Set the input using the RawExtension helper
		err := query.Spec.SetInputString("What's the weather in {{.location}}?")
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 1)

		// Check that template was resolved
		assert.NotNil(t, messages[0].OfUser)
		assert.Equal(t, "What's the weather in Berlin?", messages[0].OfUser.Content.OfString.Value)
	})

	t.Run("empty type defaults to user", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				// Type is empty, should default to "user"
			},
		}

		// Set the input using the RawExtension helper
		err := query.Spec.SetInputString("Default behavior test")
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 1)

		// Check that it defaults to user type
		assert.NotNil(t, messages[0].OfUser)
		assert.Equal(t, "Default behavior test", messages[0].OfUser.Content.OfString.Value)
	})

	t.Run("user type with template resolution error", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "user",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "missing_param",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{
									Name: "nonexistent-config",
								},
								Key: "missing-key",
							},
						},
					},
				},
			},
		}

		// Set the input using the RawExtension helper
		err := query.Spec.SetInputString("Hello {{.missing_param}}")
		require.NoError(t, err)

		_, err = GetQueryInputMessages(ctx, query, k8sClient)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to resolve query input")
	})
}

func BenchmarkGetQueryInputMessages(b *testing.B) {
	ctx := context.Background()
	scheme := runtime.NewScheme()
	require.NoError(b, corev1.AddToScheme(scheme))
	require.NoError(b, arkv1alpha1.AddToScheme(scheme))
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

	// Test with user type
	userQuery := arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "bench-query-user",
			Namespace: "test-ns",
		},
		Spec: arkv1alpha1.QuerySpec{
			Type: "user",
		},
	}

	// Set input for user query using RawExtension helper
	err := userQuery.Spec.SetInputString("Hello, this is a benchmark test message")
	require.NoError(b, err)

	b.Run("user_type", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, err := GetQueryInputMessages(ctx, userQuery, k8sClient)
			if err != nil {
				b.Fatal(err)
			}
		}
	})
}
