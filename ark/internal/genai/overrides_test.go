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

func setupTestClient(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)

	return fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objects...).
		Build()
}

func assertHeadersMatch(t *testing.T, got, want map[string]string) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("ResolveHeaders() length = %v, want %v", len(got), len(want))
		return
	}
	for key, wantVal := range want {
		if gotVal, ok := got[key]; !ok || gotVal != wantVal {
			t.Errorf("ResolveHeaders()[%s] = %v, want %v", key, gotVal, wantVal)
		}
	}
}

func TestResolveHeaders(t *testing.T) {
	tests := []struct {
		name      string
		headers   []arkv1alpha1.Header
		objects   []client.Object
		namespace string
		want      map[string]string
		wantErr   bool
	}{
		{
			name: "direct header values",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-Custom-Header",
					Value: arkv1alpha1.HeaderValue{
						Value: "custom-value",
					},
				},
				{
					Name: "Authorization",
					Value: arkv1alpha1.HeaderValue{
						Value: "Bearer token123",
					},
				},
			},
			namespace: "default",
			want: map[string]string{
				"X-Custom-Header": "custom-value",
				"Authorization":   "Bearer token123",
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
			name: "header from configmap",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-API-Key",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "api-config"},
								Key:                  "apikey",
							},
						},
					},
				},
			},
			objects: []client.Object{
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "api-config", Namespace: "default"},
					Data:       map[string]string{"apikey": "config-key"},
				},
			},
			namespace: "default",
			want: map[string]string{
				"X-API-Key": "config-key",
			},
		},
		{
			name: "missing secret",
			headers: []arkv1alpha1.Header{
				{
					Name: "Authorization",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "missing"},
								Key:                  "token",
							},
						},
					},
				},
			},
			namespace: "default",
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			got, err := ResolveHeaders(ctx, fakeClient, tt.headers, tt.namespace)

			if (err != nil) != tt.wantErr {
				t.Errorf("ResolveHeaders() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				assertHeadersMatch(t, got, tt.want)
			}
		})
	}
}

func TestListResourcesByLabels(t *testing.T) {
	tests := []struct {
		name          string
		overrideType  OverrideType
		labelSelector *metav1.LabelSelector
		objects       []client.Object
		namespace     string
		wantCount     int
		wantErr       bool
	}{
		{
			name:         "nil labelSelector selects all models",
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model1", Namespace: "default"},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model2", Namespace: "default"},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model3", Namespace: "other"},
				},
			},
			namespace: "default",
			wantCount: 2,
		},
		{
			name:         "labelSelector filters models",
			overrideType: OverrideTypeModel,
			labelSelector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"env": "prod"},
			},
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "model1",
						Namespace: "default",
						Labels:    map[string]string{"env": "prod"},
					},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "model2",
						Namespace: "default",
						Labels:    map[string]string{"env": "dev"},
					},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "model3",
						Namespace: "default",
						Labels:    map[string]string{"env": "prod"},
					},
				},
			},
			namespace: "default",
			wantCount: 2,
		},
		{
			name:         "nil labelSelector selects all mcpservers",
			overrideType: OverrideTypeMCPServer,
			objects: []client.Object{
				&arkv1alpha1.MCPServer{
					ObjectMeta: metav1.ObjectMeta{Name: "mcp1", Namespace: "default"},
				},
				&arkv1alpha1.MCPServer{
					ObjectMeta: metav1.ObjectMeta{Name: "mcp2", Namespace: "default"},
				},
			},
			namespace: "default",
			wantCount: 2,
		},
		{
			name:         "labelSelector with no matches",
			overrideType: OverrideTypeModel,
			labelSelector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"env": "prod"},
			},
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "model1",
						Namespace: "default",
						Labels:    map[string]string{"env": "dev"},
					},
				},
			},
			namespace: "default",
			wantCount: 0,
		},
		{
			name:         "empty namespace with nil selector",
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model1", Namespace: "default"},
				},
			},
			namespace: "other",
			wantCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			got, err := listResourcesByLabels(ctx, fakeClient, tt.namespace, tt.overrideType, tt.labelSelector)

			if (err != nil) != tt.wantErr {
				t.Errorf("listResourcesByLabels() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if len(got) != tt.wantCount {
				t.Errorf("listResourcesByLabels() count = %v, want %v", len(got), tt.wantCount)
			}
		})
	}
}

func assertResourceHeadersMatch(t *testing.T, got, want map[string]map[string]string) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("ResolveHeadersFromOverrides() resource count = %v, want %v", len(got), len(want))
		return
	}
	for resource, wantHeaders := range want {
		gotHeaders, ok := got[resource]
		if !ok {
			t.Errorf("ResolveHeadersFromOverrides() missing resource %s", resource)
			continue
		}
		if len(gotHeaders) != len(wantHeaders) {
			t.Errorf("ResolveHeadersFromOverrides()[%s] header count = %v, want %v", resource, len(gotHeaders), len(wantHeaders))
			continue
		}
		for key, wantVal := range wantHeaders {
			if gotVal, ok := gotHeaders[key]; !ok || gotVal != wantVal {
				t.Errorf("ResolveHeadersFromOverrides()[%s][%s] = %v, want %v", resource, key, gotVal, wantVal)
			}
		}
	}
}

func TestResolveHeadersFromOverrides(t *testing.T) {
	tests := []struct {
		name         string
		overrides    []arkv1alpha1.Override
		overrideType OverrideType
		objects      []client.Object
		namespace    string
		want         map[string]map[string]string
		wantErr      bool
	}{
		{
			name: "override with nil labelSelector applies to all models",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "model",
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Custom-Header",
							Value: arkv1alpha1.HeaderValue{
								Value: "all-models",
							},
						},
					},
				},
			},
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model1", Namespace: "default"},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model2", Namespace: "default"},
				},
			},
			namespace: "default",
			want: map[string]map[string]string{
				"model1": {"X-Custom-Header": "all-models"},
				"model2": {"X-Custom-Header": "all-models"},
			},
		},
		{
			name: "override with labelSelector applies to matching models only",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "model",
					LabelSelector: &metav1.LabelSelector{
						MatchLabels: map[string]string{"tier": "premium"},
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Priority",
							Value: arkv1alpha1.HeaderValue{
								Value: "high",
							},
						},
					},
				},
			},
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "premium-model",
						Namespace: "default",
						Labels:    map[string]string{"tier": "premium"},
					},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "basic-model",
						Namespace: "default",
						Labels:    map[string]string{"tier": "basic"},
					},
				},
			},
			namespace: "default",
			want: map[string]map[string]string{
				"premium-model": {"X-Priority": "high"},
			},
		},
		{
			name: "multiple overrides with different selectors",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "model",
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Common",
							Value: arkv1alpha1.HeaderValue{
								Value: "all",
							},
						},
					},
				},
				{
					ResourceType: "model",
					LabelSelector: &metav1.LabelSelector{
						MatchLabels: map[string]string{"special": "true"},
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Special",
							Value: arkv1alpha1.HeaderValue{
								Value: "yes",
							},
						},
					},
				},
			},
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "special-model",
						Namespace: "default",
						Labels:    map[string]string{"special": "true"},
					},
				},
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "regular-model", Namespace: "default"},
				},
			},
			namespace: "default",
			want: map[string]map[string]string{
				"special-model": {
					"X-Common":  "all",
					"X-Special": "yes",
				},
				"regular-model": {
					"X-Common": "all",
				},
			},
		},
		{
			name: "override with wrong resource type is ignored",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "mcpserver",
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-MCP-Header",
							Value: arkv1alpha1.HeaderValue{
								Value: "value",
							},
						},
					},
				},
			},
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model1", Namespace: "default"},
				},
			},
			namespace: "default",
			want:      map[string]map[string]string{},
		},
		{
			name: "override with header from secret",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "model",
					Headers: []arkv1alpha1.Header{
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
				},
			},
			overrideType: OverrideTypeModel,
			objects: []client.Object{
				&arkv1alpha1.Model{
					ObjectMeta: metav1.ObjectMeta{Name: "model1", Namespace: "default"},
				},
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: "api-secret", Namespace: "default"},
					Data:       map[string][]byte{"token": []byte("Bearer secret123")},
				},
			},
			namespace: "default",
			want: map[string]map[string]string{
				"model1": {"Authorization": "Bearer secret123"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			got, err := ResolveHeadersFromOverrides(ctx, fakeClient, tt.overrides, tt.namespace, tt.overrideType)

			if (err != nil) != tt.wantErr {
				t.Errorf("ResolveHeadersFromOverrides() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				assertResourceHeadersMatch(t, got, tt.want)
			}
		})
	}
}
