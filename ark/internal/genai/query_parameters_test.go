package genai

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
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

	t.Run("messages type with multiple messages", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}

		// Set the messages using the RawExtension helper
		inputMessages := []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage("Hello!"),
			openai.AssistantMessage("Hi there! How can I help you?"),
			openai.UserMessage("What's the weather like?"),
		}
		err := query.Spec.SetInputMessages(inputMessages)
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 3)

		// Check first message (user)
		assert.NotNil(t, messages[0].OfUser)
		assert.Equal(t, "Hello!", messages[0].OfUser.Content.OfString.Value)

		// Check second message (assistant)
		assert.NotNil(t, messages[1].OfAssistant)
		assert.Equal(t, "Hi there! How can I help you?", messages[1].OfAssistant.Content.OfString.Value)

		// Check third message (user)
		assert.NotNil(t, messages[2].OfUser)
		assert.Equal(t, "What's the weather like?", messages[2].OfUser.Content.OfString.Value)
	})

	t.Run("messages type with system message", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}

		// Set the messages using the RawExtension helper
		inputMessages := []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage("You are a helpful assistant."),
			openai.UserMessage("Hello!"),
		}
		err := query.Spec.SetInputMessages(inputMessages)
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 2)

		// Check system message
		assert.NotNil(t, messages[0].OfSystem)
		assert.Equal(t, "You are a helpful assistant.", messages[0].OfSystem.Content.OfString.Value)

		// Check user message
		assert.NotNil(t, messages[1].OfUser)
		assert.Equal(t, "Hello!", messages[1].OfUser.Content.OfString.Value)
	})

	t.Run("messages type with tool message", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}

		// Set the messages using the RawExtension helper
		inputMessages := []openai.ChatCompletionMessageParamUnion{
			openai.ToolMessage("Tool result", "call_123"),
		}
		err := query.Spec.SetInputMessages(inputMessages)
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 1)
		assert.NotNil(t, messages[0].OfTool)
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

	t.Run("messages type with empty messages array", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(scheme).Build()

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-query",
				Namespace: "test-ns",
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "messages",
			},
		}

		// Set empty messages array using the RawExtension helper
		err := query.Spec.SetInputMessages([]openai.ChatCompletionMessageParamUnion{})
		require.NoError(t, err)

		messages, err := GetQueryInputMessages(ctx, query, k8sClient)
		require.NoError(t, err)
		require.Len(t, messages, 0)
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

	// Test with messages type
	messagesQuery := arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "bench-query-messages",
			Namespace: "test-ns",
		},
		Spec: arkv1alpha1.QuerySpec{
			Type: "messages",
		},
	}

	// Set input for messages query using RawExtension helper
	benchMessages := []openai.ChatCompletionMessageParamUnion{
		openai.UserMessage("Hello!"),
		openai.AssistantMessage("Hi there! How can I help you?"),
		openai.UserMessage("This is a benchmark test"),
	}
	err = messagesQuery.Spec.SetInputMessages(benchMessages)
	require.NoError(b, err)

	b.Run("user_type", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, err := GetQueryInputMessages(ctx, userQuery, k8sClient)
			if err != nil {
				b.Fatal(err)
			}
		}
	})

	b.Run("messages_type", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, err := GetQueryInputMessages(ctx, messagesQuery, k8sClient)
			if err != nil {
				b.Fatal(err)
			}
		}
	})
}
