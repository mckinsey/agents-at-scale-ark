package genai

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

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.Len(t, got, tt.wantCount)
		})
	}
}

func TestResolveHeadersFromOverrides(t *testing.T) {
	tests := []struct {
		name           string
		overrides      []arkv1alpha1.Override
		overrideType   OverrideType
		objects        []client.Object
		namespace      string
		want           map[string]map[string]string
		wantErr        bool
		wantErrContain string
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
		{
			name: "override with missing secret fails",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "model",
					Headers: []arkv1alpha1.Header{
						{
							Name: "Authorization",
							Value: arkv1alpha1.HeaderValue{
								ValueFrom: &arkv1alpha1.HeaderValueSource{
									SecretKeyRef: &corev1.SecretKeySelector{
										LocalObjectReference: corev1.LocalObjectReference{Name: "missing-secret"},
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
			},
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "secrets \"missing-secret\" not found",
		},
		{
			name: "invalid label selector",
			overrides: []arkv1alpha1.Override{
				{
					ResourceType: "model",
					LabelSelector: &metav1.LabelSelector{
						MatchExpressions: []metav1.LabelSelectorRequirement{
							{
								Key:      "invalid",
								Operator: "InvalidOperator",
								Values:   []string{"value"},
							},
						},
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Header",
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
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "not a valid label selector operator",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			got, err := ResolveHeadersFromOverrides(ctx, fakeClient, tt.overrides, tt.namespace, tt.overrideType)

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

func TestResolveHeadersWithQueryContext(t *testing.T) {
	tests := []struct {
		name           string
		headers        []arkv1alpha1.Header
		query          *arkv1alpha1.Query
		objects        []client.Object
		namespace      string
		want           map[string]string
		wantErr        bool
		wantErrContain string
	}{
		{
			name: "header from query parameter",
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
			name: "multiple headers from query parameters",
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
				{
					Name: "X-Session-ID",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "sessionId",
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
							Value: "user-456",
						},
						{
							Name:  "sessionId",
							Value: "session-789",
						},
					},
				},
			},
			namespace: "default",
			want: map[string]string{
				"X-User-ID":    "user-456",
				"X-Session-ID": "session-789",
			},
		},
		{
			name: "mixed headers - direct, secret, and query parameter",
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
				{
					Name: "X-From-Query",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "customValue",
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
							Name:  "customValue",
							Value: "from-query",
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
				"X-Direct":      "direct-value",
				"X-From-Secret": "secret-token",
				"X-From-Query":  "from-query",
			},
		},
		{
			name: "query parameter ref without query context fails",
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
			query:          nil,
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "queryParameterRef requires query context",
		},
		{
			name: "query parameter not found in query",
			headers: []arkv1alpha1.Header{
				{
					Name: "X-User-ID",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							QueryParameterRef: &arkv1alpha1.QueryParameterReference{
								Name: "missingParam",
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
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "query parameter 'missingParam' not found",
		},
		{
			name: "query parameter with empty value fails",
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
							Value: "",
						},
					},
				},
			},
			namespace:      "default",
			wantErr:        true,
			wantErrContain: "query parameter 'userId' has no value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			if tt.query != nil {
				ctx = context.WithValue(ctx, QueryContextKey, tt.query)
			}
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
		query          *arkv1alpha1.Query
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
		{
			name: "queryParameterRef with query context",
			header: arkv1alpha1.Header{
				Name: "X-User-ID",
				Value: arkv1alpha1.HeaderValue{
					ValueFrom: &arkv1alpha1.HeaderValueSource{
						QueryParameterRef: &arkv1alpha1.QueryParameterReference{
							Name: "userId",
						},
					},
				},
			},
			query: &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: "test-query", Namespace: "default"},
				Spec: arkv1alpha1.QuerySpec{
					Parameters: []arkv1alpha1.Parameter{
						{Name: "userId", Value: "user-123"},
					},
				},
			},
			namespace: "default",
			want:      "user-123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := setupTestClient(tt.objects)
			ctx := context.Background()
			if tt.query != nil {
				ctx = context.WithValue(ctx, QueryContextKey, tt.query)
			}
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
