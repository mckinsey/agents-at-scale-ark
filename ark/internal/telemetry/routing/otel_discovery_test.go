package routing

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func TestParseOTELSecret(t *testing.T) {
	tests := []struct {
		name   string
		secret *corev1.Secret
		want   *OTELEndpoint
	}{
		{
			name: "valid HTTP endpoint without headers",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "test-ns"},
				Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector.example.com:4318/v1/traces")},
			},
			want: &OTELEndpoint{Endpoint: "http://collector.example.com:4318/v1/traces", TLS: false},
		},
		{
			name: "valid HTTPS endpoint with headers",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "test-ns"},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("https://api.honeycomb.io/v1/traces"),
					"OTEL_EXPORTER_OTLP_HEADERS":  []byte("x-honeycomb-team=abc123"),
				},
			},
			want: &OTELEndpoint{Endpoint: "https://api.honeycomb.io/v1/traces", Headers: "x-honeycomb-team=abc123", TLS: true},
		},
		{
			name: "missing endpoint",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "test-ns"},
				Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_HEADERS": []byte("Authorization=Bearer token")},
			},
			want: nil,
		},
		{
			name: "empty endpoint",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "test-ns"},
				Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("  ")},
			},
			want: nil,
		},
		{
			name: "langfuse configuration",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "pdlc"},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://langfuse.svc:3000/api/public/otel"),
					"OTEL_EXPORTER_OTLP_HEADERS":  []byte("Authorization=Basic dXNlcjpwYXNz"),
				},
			},
			want: &OTELEndpoint{Endpoint: "http://langfuse.svc:3000/api/public/otel", Headers: "Authorization=Basic dXNlcjpwYXNz", TLS: false},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseOTELSecret(tt.secret)
			assertOTELEndpoint(t, got, tt.want)
		})
	}
}

func assertOTELEndpoint(t *testing.T, got, want *OTELEndpoint) {
	t.Helper()
	if want == nil {
		if got != nil {
			t.Errorf("got %+v, want nil", got)
		}
		return
	}
	if got == nil {
		t.Fatal("got nil, want non-nil")
	}
	if got.Endpoint != want.Endpoint {
		t.Errorf("Endpoint = %q, want %q", got.Endpoint, want.Endpoint)
	}
	if got.Headers != want.Headers {
		t.Errorf("Headers = %q, want %q", got.Headers, want.Headers)
	}
	if got.TLS != want.TLS {
		t.Errorf("TLS = %v, want %v", got.TLS, want.TLS)
	}
}

func TestDiscoverOTELEndpoints_NilClient(t *testing.T) {
	got, err := DiscoverOTELEndpoints(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("got %v, want nil", got)
	}
}

func TestDiscoverOTELEndpoints(t *testing.T) {
	tests := []struct {
		name    string
		secrets []runtime.Object
		want    []OTELEndpoint
	}{
		{
			name:    "no secrets returns empty",
			secrets: []runtime.Object{},
			want:    []OTELEndpoint{},
		},
		{
			name: "ignores non-matching secrets",
			secrets: []runtime.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: "other-secret", Namespace: "ns1"},
					Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector:4318")},
				},
			},
			want: []OTELEndpoint{},
		},
		{
			name: "discovers single endpoint",
			secrets: []runtime.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-a"},
					Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector:4318/v1/traces")},
				},
			},
			want: []OTELEndpoint{{Namespace: "tenant-a", Endpoint: "http://collector:4318/v1/traces", TLS: false}},
		},
		{
			name: "discovers multiple endpoints",
			secrets: []runtime.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-a"},
					Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector-a:4318")},
				},
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-b"},
					Data: map[string][]byte{
						"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("https://collector-b:443"),
						"OTEL_EXPORTER_OTLP_HEADERS":  []byte("Authorization=Bearer token"),
					},
				},
			},
			want: []OTELEndpoint{
				{Namespace: "tenant-a", Endpoint: "http://collector-a:4318", TLS: false},
				{Namespace: "tenant-b", Endpoint: "https://collector-b:443", Headers: "Authorization=Bearer token", TLS: true},
			},
		},
		{
			name: "skips secrets with missing endpoint",
			secrets: []runtime.Object{
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-a"},
					Data:       map[string][]byte{"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://valid:4318")},
				},
				&corev1.Secret{
					ObjectMeta: metav1.ObjectMeta{Name: otelSecretName, Namespace: "tenant-b"},
					Data:       map[string][]byte{"OTHER_KEY": []byte("value")},
				},
			},
			want: []OTELEndpoint{{Namespace: "tenant-a", Endpoint: "http://valid:4318", TLS: false}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := fake.NewClientBuilder().WithRuntimeObjects(tt.secrets...).Build()
			got, err := DiscoverOTELEndpoints(context.Background(), client)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			assertEndpointsEqual(t, got, tt.want)
		})
	}
}

func assertEndpointsEqual(t *testing.T, got, want []OTELEndpoint) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %d endpoints, want %d", len(got), len(want))
	}
	for i := range want {
		assertOTELEndpointEqual(t, got[i], want[i])
	}
}

func assertOTELEndpointEqual(t *testing.T, got, want OTELEndpoint) {
	t.Helper()
	if got.Namespace != want.Namespace {
		t.Errorf("Namespace = %q, want %q", got.Namespace, want.Namespace)
	}
	if got.Endpoint != want.Endpoint {
		t.Errorf("Endpoint = %q, want %q", got.Endpoint, want.Endpoint)
	}
	if got.Headers != want.Headers {
		t.Errorf("Headers = %q, want %q", got.Headers, want.Headers)
	}
	if got.TLS != want.TLS {
		t.Errorf("TLS = %v, want %v", got.TLS, want.TLS)
	}
}
