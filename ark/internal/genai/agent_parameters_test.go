package genai

import (
	"context"
	"reflect"
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

func TestResolvePromptWithParams(t *testing.T) {
	tests := []struct {
		name       string
		agent      *Agent
		params     map[string]string
		wantPrompt string
		wantErr    bool
	}{
		{
			name: "apply pre-resolved params",
			agent: &Agent{
				Name:   "test-agent",
				Prompt: "Hello {{.name}}, welcome to {{.place}}",
			},
			params: map[string]string{
				"name":  "Alice",
				"place": "Wonderland",
			},
			wantPrompt: "Hello Alice, welcome to Wonderland",
		},
		{
			name: "empty params returns original prompt",
			agent: &Agent{
				Name:   "test-agent",
				Prompt: "Hello World",
			},
			params:     map[string]string{},
			wantPrompt: "Hello World",
		},
		{
			name: "nil params returns original prompt",
			agent: &Agent{
				Name:   "test-agent",
				Prompt: "Hello World",
			},
			params:     nil,
			wantPrompt: "Hello World",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.agent.resolvePromptWithParams(tt.params)

			if (err != nil) != tt.wantErr {
				t.Errorf("resolvePromptWithParams() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if got != tt.wantPrompt {
				t.Errorf("resolvePromptWithParams() = %v, want %v", got, tt.wantPrompt)
			}
		})
	}
}

func TestConvertResolvedParameters(t *testing.T) {
	tests := []struct {
		name     string
		resolved map[string]string
		want     []Parameter
	}{
		{
			name:     "nil map returns nil",
			resolved: nil,
			want:     nil,
		},
		{
			name:     "empty map returns nil",
			resolved: map[string]string{},
			want:     nil,
		},
		{
			name: "single parameter",
			resolved: map[string]string{
				"name": "value",
			},
			want: []Parameter{
				{Name: "name", Value: "value"},
			},
		},
		{
			name: "multiple parameters sorted by name",
			resolved: map[string]string{
				"zebra": "z-value",
				"alpha": "a-value",
				"mango": "m-value",
			},
			want: []Parameter{
				{Name: "alpha", Value: "a-value"},
				{Name: "mango", Value: "m-value"},
				{Name: "zebra", Value: "z-value"},
			},
		},
		{
			name: "json value preserved",
			resolved: map[string]string{
				"subagents": `{"researcher": {"description": "Research"}}`,
			},
			want: []Parameter{
				{Name: "subagents", Value: `{"researcher": {"description": "Research"}}`},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := convertResolvedParameters(tt.resolved)

			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("convertResolvedParameters() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestResolvedParametersDrilledToExecutor(t *testing.T) {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "config-secret", Namespace: "default"},
		Data: map[string][]byte{
			"subagents": []byte(`{"coder": {"description": "Write code"}}`),
		},
	}

	fakeClient := fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(secret).
		Build()

	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "test-query"},
		Spec: arkv1alpha1.QuerySpec{
			Parameters: []arkv1alpha1.Parameter{
				{
					Name: "subagents_config",
					ValueFrom: &arkv1alpha1.ValueFromSource{
						SecretKeyRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "config-secret"},
							Key:                  "subagents",
						},
					},
				},
			},
		},
	}

	agent := &Agent{
		Name:      "test-agent",
		Namespace: "default",
		Prompt:    "You have subagents: {{.subagents}}",
		Parameters: []arkv1alpha1.Parameter{
			{
				Name: "subagents",
				ValueFrom: &arkv1alpha1.ValueFromSource{
					QueryParameterRef: &arkv1alpha1.QueryParameterReference{
						Name: "subagents_config",
					},
				},
			},
		},
		client: fakeClient,
	}

	ctx := context.WithValue(context.Background(), QueryContextKey, query)

	resolvedParams, err := agent.resolveParameters(ctx)
	if err != nil {
		t.Fatalf("resolveParameters() error = %v", err)
	}

	expectedValue := `{"coder": {"description": "Write code"}}`
	if resolvedParams["subagents"] != expectedValue {
		t.Errorf("resolvedParams[subagents] = %v, want %v", resolvedParams["subagents"], expectedValue)
	}

	resolvedPrompt, err := agent.resolvePromptWithParams(resolvedParams)
	if err != nil {
		t.Fatalf("resolvePromptWithParams() error = %v", err)
	}

	expectedPrompt := "You have subagents: " + expectedValue
	if resolvedPrompt != expectedPrompt {
		t.Errorf("resolvePromptWithParams() = %v, want %v", resolvedPrompt, expectedPrompt)
	}

	executorParams := convertResolvedParameters(resolvedParams)
	if len(executorParams) != 1 {
		t.Fatalf("convertResolvedParameters() returned %d params, want 1", len(executorParams))
	}
	if executorParams[0].Name != "subagents" || executorParams[0].Value != expectedValue {
		t.Errorf("executorParams[0] = %v, want {subagents, %v}", executorParams[0], expectedValue)
	}
}
