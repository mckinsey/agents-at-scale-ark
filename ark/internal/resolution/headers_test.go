package resolution

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
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

func TestResolveHeaders(t *testing.T) {
	tests := []struct {
		name           string
		headers        []arkv1alpha1.Header
		objects        []client.Object
		namespace      string
		want           map[string]string
		wantErr        bool
		wantErrContain string
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
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "secrets \"missing\" not found",
		},
		{
			name: "missing configmap",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-API-Key",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "missing-cm"},
								Key:                  "key",
							},
						},
					},
				},
			},
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "configmaps \"missing-cm\" not found",
		},
		{
			name: "missing key in secret",
			headers: []arkv1alpha1.Header{
				{
					Name: "Authorization",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "api-secret"},
								Key:                  "missing-key",
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
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "key missing-key not found",
		},
		{
			name: "missing key in configmap",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-API-Key",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: "api-config"},
								Key:                  "missing-key",
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
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "key missing-key not found",
		},
		{
			name: "mixed direct and reference values",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-Direct",
					Value: arkv1alpha1.HeaderValue{
						Value: "direct-value",
					},
				},
				{
					Name: "X-From-Secret",
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
					Data:       map[string][]byte{"token": []byte("secret-value")},
				},
			},
			namespace: "default",
			want: map[string]string{
				"X-Direct":      "direct-value",
				"X-From-Secret": "secret-value",
			},
		},
		{
			name: "queryParameterRef returns error",
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
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "queryParameterRef not supported in this context",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			got, err := ResolveHeaders(ctx, fakeClient, tt.headers, tt.namespace)

			if tt.wantErr {
				require.Error(t, err)
				if tt.wantErrContain != "" {
					require.ErrorContains(t, err, tt.wantErrContain)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestResolveHeaderValue(t *testing.T) {
	tests := []struct {
		name           string
		header         arkv1alpha1.Header
		objects        []client.Object
		namespace      string
		want           string
		wantErr        bool
		wantErrContain string
	}{
		{
			name: "direct value",
			header: arkv1alpha1.Header{
				Name: "X-Custom",
				Value: arkv1alpha1.HeaderValue{
					Value: "direct-value",
				},
			},
			namespace: "default",
			want:      "direct-value",
		},
		{
			name: "value from secret",
			header: arkv1alpha1.Header{
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
			objects: []client.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: "api-secret", Namespace: "default"},
					Data:       map[string][]byte{"token": []byte("secret-token")},
				},
			},
			namespace: "default",
			want:      "secret-token",
		},
		{
			name: "missing value and valueFrom fails",
			header: arkv1alpha1.Header{
				Name:  "X-Empty",
				Value: arkv1alpha1.HeaderValue{},
			},
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "header value must specify either value or valueFrom",
		},
		{
			name: "valueFrom with no valid source fails",
			header: arkv1alpha1.Header{
				Name: "X-Invalid",
				Value: arkv1alpha1.HeaderValue{
					ValueFrom: &arkv1alpha1.HeaderValueSource{},
				},
			},
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "header value must specify either value or valueFrom with a valid source",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			got, err := ResolveHeaderValue(ctx, fakeClient, tt.header, tt.namespace)

			if tt.wantErr {
				require.Error(t, err)
				if tt.wantErrContain != "" {
					require.ErrorContains(t, err, tt.wantErrContain)
				}
				return
			}

			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}
