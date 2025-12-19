package genai

import (
	"context"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResolveModelSpec_NilModelSpec(t *testing.T) {
	_, _, err := ResolveModelSpec(nil, "default")
	if err == nil || !strings.Contains(err.Error(), "model spec is nil") {
		t.Errorf("expected 'model spec is nil' error, got: %v", err)
	}
}

func TestResolveModelSpec_NilAgentModelRefPointer(t *testing.T) {
	_, _, err := ResolveModelSpec((*arkv1alpha1.AgentModelRef)(nil), "default")
	if err == nil || !strings.Contains(err.Error(), "AgentModelRef pointer is nil") {
		t.Errorf("expected 'AgentModelRef pointer is nil' error, got: %v", err)
	}
}

func TestResolveModelSpec_ValidAgentModelRef(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec(&arkv1alpha1.AgentModelRef{
		Name:      "my-model",
		Namespace: "custom-ns",
	}, "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "my-model" || namespace != "custom-ns" {
		t.Errorf("got (%q, %q), want (my-model, custom-ns)", modelName, namespace)
	}
}

func TestResolveModelSpec_AgentModelRefUsesDefaultNamespace(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec(&arkv1alpha1.AgentModelRef{Name: "my-model"}, "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "my-model" || namespace != "default" {
		t.Errorf("got (%q, %q), want (my-model, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_StringModelSpec(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec("string-model", "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "string-model" || namespace != "default" {
		t.Errorf("got (%q, %q), want (string-model, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_EmptyStringUsesDefaultModel(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec("", "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "default" || namespace != "default" {
		t.Errorf("got (%q, %q), want (default, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_UnsupportedType(t *testing.T) {
	_, _, err := ResolveModelSpec(123, "default")
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

func TestResolveModelHeaders(t *testing.T) {
	tests := []struct {
		name      string
		headers   []arkv1alpha1.Header
		query     *arkv1alpha1.Query
		objects   []client.Object
		namespace string
		want      map[string]string
		wantErr   bool
	}{
		{
			name: "direct header value",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-Custom",
					Value: arkv1alpha1.HeaderValue{
						Value: "direct-value",
					},
				},
			},
			namespace: "default",
			want: map[string]string{
				"X-Custom": "direct-value",
			},
		},
		{
			name: "header from secret",
			headers: []arkv1alpha1.Header{
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
			},
			objects: []client.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: "api-secret", Namespace: "default"},
					Data:       map[string][]byte{"token": []byte("secret-token")},
				},
			},
			namespace: "default",
			want: map[string]string{
				"Authorization": "secret-token",
			},
		},
		{
			name: "header from query parameter with query context",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-User-ID",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "userId",
							},
						},
					},
				},
			},
			query: &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Parameters: []arkv1alpha1.Parameter{
						{
							Name:  "userId",
							Value: "user-123",
						},
					},
				},
			},
			namespace: "default",
			want: map[string]string{
				"X-User-ID": "user-123",
			},
		},
		{
			name: "header from query parameter without query context fails",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-User-ID",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "userId",
							},
						},
					},
				},
			},
			query:     nil,
			namespace: "default",
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupModelTestClient(tt.objects)
			ctx := context.Background()
			if tt.query != nil {
				ctx = context.WithValue(ctx, QueryContextKey, tt.query)
			}

			got, err := resolveModelHeaders(ctx, fakeClient, tt.headers, tt.namespace)

			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if len(got) != len(tt.want) {
				t.Errorf("got %d headers, want %d", len(got), len(tt.want))
				return
			}

			for k, v := range tt.want {
				if got[k] != v {
					t.Errorf("header %s: got %q, want %q", k, got[k], v)
				}
			}
		})
	}
}
