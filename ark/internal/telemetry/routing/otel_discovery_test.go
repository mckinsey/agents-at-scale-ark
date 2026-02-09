package routing

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestParseOTELSecret(t *testing.T) {
	tests := []struct {
		name           string
		secret         *corev1.Secret
		wantEndpoint   string
		wantHeaders    string
		wantTLS        bool
		wantNil        bool
	}{
		{
			name: "valid HTTP endpoint without headers",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      otelSecretName,
					Namespace: "test-ns",
				},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://collector.example.com:4318/v1/traces"),
				},
			},
			wantEndpoint: "http://collector.example.com:4318/v1/traces",
			wantHeaders:  "",
			wantTLS:      false,
			wantNil:      false,
		},
		{
			name: "valid HTTPS endpoint with headers",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      otelSecretName,
					Namespace: "test-ns",
				},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("https://api.honeycomb.io/v1/traces"),
					"OTEL_EXPORTER_OTLP_HEADERS":  []byte("x-honeycomb-team=abc123"),
				},
			},
			wantEndpoint: "https://api.honeycomb.io/v1/traces",
			wantHeaders:  "x-honeycomb-team=abc123",
			wantTLS:      true,
			wantNil:      false,
		},
		{
			name: "missing endpoint",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      otelSecretName,
					Namespace: "test-ns",
				},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_HEADERS": []byte("Authorization=Bearer token"),
				},
			},
			wantNil: true,
		},
		{
			name: "empty endpoint",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      otelSecretName,
					Namespace: "test-ns",
				},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("  "),
				},
			},
			wantNil: true,
		},
		{
			name: "langfuse configuration",
			secret: &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      otelSecretName,
					Namespace: "pdlc",
				},
				Data: map[string][]byte{
					"OTEL_EXPORTER_OTLP_ENDPOINT": []byte("http://langfuse.svc:3000/api/public/otel"),
					"OTEL_EXPORTER_OTLP_HEADERS":  []byte("Authorization=Basic dXNlcjpwYXNz"),
				},
			},
			wantEndpoint: "http://langfuse.svc:3000/api/public/otel",
			wantHeaders:  "Authorization=Basic dXNlcjpwYXNz",
			wantTLS:      false,
			wantNil:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseOTELSecret(tt.secret)
			if err != nil {
				t.Errorf("parseOTELSecret() error = %v", err)
				return
			}

			if tt.wantNil {
				if got != nil {
					t.Errorf("parseOTELSecret() = %v, want nil", got)
				}
				return
			}

			if got == nil {
				t.Errorf("parseOTELSecret() = nil, want non-nil")
				return
			}

			if got.Endpoint != tt.wantEndpoint {
				t.Errorf("parseOTELSecret() Endpoint = %v, want %v", got.Endpoint, tt.wantEndpoint)
			}
			if got.Headers != tt.wantHeaders {
				t.Errorf("parseOTELSecret() Headers = %v, want %v", got.Headers, tt.wantHeaders)
			}
			if got.TLS != tt.wantTLS {
				t.Errorf("parseOTELSecret() TLS = %v, want %v", got.TLS, tt.wantTLS)
			}
		})
	}
}
