package genai

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestAgentParameterResolution(t *testing.T) {
	tests := []struct {
		name       string
		agent      *Agent
		query      *arkv1alpha1.Query
		objects    []client.Object
		wantPrompt string
		wantErr    bool
	}{
		{
			name: "direct parameter value",
			agent: &Agent{
				Name:   "test-agent",
				Prompt: "Hello {{.name}}",
				Parameters: []arkv1alpha1.Parameter{
					{Name: "name", Value: "World"},
				},
			},
			wantPrompt: "Hello World",
		},
		{
			name: "configmap reference",
			agent: &Agent{
				Name:      "test-agent",
				Namespace: "default",
				Prompt:    "Hello {{.name}}",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "name",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "config"},
								Key:                  "greeting",
							},
						},
					},
				},
			},
			objects: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "config", Namespace: "default"},
					Data:       map[string]string{"greeting": "ConfigWorld"},
				},
			},
			wantPrompt: "Hello ConfigWorld",
		},
		{
			name: "query parameter reference",
			agent: &Agent{
				Name:      "test-agent",
				Namespace: "default",
				Prompt:    "Hello {{.name}}",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "name",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "user_name",
							},
						},
					},
				},
			},
			query: &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: "test-query"},
				Spec: arkv1alpha1.QuerySpec{
					Parameters: []arkv1alpha1.Parameter{
						{Name: "user_name", Value: "QueryUser"},
					},
				},
			},
			wantPrompt: "Hello QueryUser",
		},
		{
			name: "nested valueFrom resolution",
			agent: &Agent{
				Name:      "test-agent",
				Namespace: "default",
				Prompt:    "Hello {{.name}}",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "name",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "nested_name",
							},
						},
					},
				},
			},
			query: &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: "test-query"},
				Spec: arkv1alpha1.QuerySpec{
					Parameters: []arkv1alpha1.Parameter{
						{
							Name: "nested_name",
							ValueFrom: &arkv1alpha1.ValueFromSource{
								SecretKeyRef: &corev1.SecretKeySelector{
									LocalObjectReference: corev1.LocalObjectReference{Name: "secret"},
									Key:                  "username",
								},
							},
						},
					},
				},
			},
			objects: []client.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: "secret", Namespace: "default"},
					Data:       map[string][]byte{"username": []byte("NestedUser")},
				},
			},
			wantPrompt: "Hello NestedUser",
		},
		{
			name: "missing query context",
			agent: &Agent{
				Name:      "test-agent",
				Namespace: "default",
				Prompt:    "Hello {{.name}}",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "name",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "user_name",
							},
						},
					},
				},
			},
			// No query in context
			wantErr: true,
		},
		{
			name: "query parameter not found",
			agent: &Agent{
				Name:      "test-agent",
				Namespace: "default",
				Prompt:    "Hello {{.name}}",
				Parameters: []arkv1alpha1.Parameter{
					{
						Name: "name",
						ValueFrom: &arkv1alpha1.ValueFromSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "missing_param",
							},
						},
					},
				},
			},
			query: &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: "test-query"},
				Spec: arkv1alpha1.QuerySpec{
					Parameters: []arkv1alpha1.Parameter{
						{Name: "other_param", Value: "value"},
					},
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Build fake client with objects
			scheme := runtime.NewScheme()
			_ = corev1.AddToScheme(scheme)
			_ = arkv1alpha1.AddToScheme(scheme)

			objs := append([]client.Object{}, tt.objects...)
			fakeClient := fake.NewClientBuilder().
				WithScheme(scheme).
				WithObjects(objs...).
				Build()

			tt.agent.client = fakeClient

			// Setup context with query if provided
			ctx := context.Background()
			if tt.query != nil {
				ctx = context.WithValue(ctx, QueryContextKey, tt.query)
			}

			// Test parameter resolution
			got, err := tt.agent.resolvePrompt(ctx)

			if (err != nil) != tt.wantErr {
				t.Errorf("resolvePrompt() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if got != tt.wantPrompt {
				t.Errorf("resolvePrompt() = %v, want %v", got, tt.wantPrompt)
			}
		})
	}
}
