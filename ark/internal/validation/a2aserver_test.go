package validation

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestValidateA2AServer(t *testing.T) {
	t.Run("valid a2aserver", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects empty address", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for empty address")
		}
	})

	t.Run("rejects both value and valueFrom", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{
					Value:     "http://localhost",
					ValueFrom: &arkv1prealpha1.ValueFromSource{},
				},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for both value and valueFrom")
		}
	})

	t.Run("rejects duplicate headers", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1prealpha1.Header{
					{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v1"}},
					{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v2"}},
				},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for duplicate headers")
		}
	})

	t.Run("rejects header without value", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost"},
				Headers: []arkv1prealpha1.Header{
					{Name: "X-Key", Value: arkv1alpha1.HeaderValue{}},
				},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for header without value")
		}
	})

	t.Run("rejects negative poll interval", func(t *testing.T) {
		a2a := &arkv1prealpha1.A2AServer{
			Spec: arkv1prealpha1.A2AServerSpec{
				Address:      arkv1prealpha1.ValueSource{Value: "http://localhost"},
				PollInterval: &metav1.Duration{Duration: -1 * time.Second},
			},
		}
		_, err := ValidateA2AServer(a2a)
		if err == nil {
			t.Fatal("expected error for negative poll interval")
		}
	})
}

func TestConvertV1PreAlpha1ValueSource(t *testing.T) {
	t.Run("converts direct value", func(t *testing.T) {
		vs := arkv1prealpha1.ValueSource{Value: "http://localhost"}
		out := convertV1PreAlpha1ValueSource(vs)
		if out.Value != "http://localhost" {
			t.Fatal("expected value to be preserved")
		}
	})

	t.Run("converts secretKeyRef", func(t *testing.T) {
		vs := arkv1prealpha1.ValueSource{
			ValueFrom: &arkv1prealpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s"},
					Key:                  "k",
				},
			},
		}
		out := convertV1PreAlpha1ValueSource(vs)
		if out.ValueFrom == nil || out.ValueFrom.SecretKeyRef == nil {
			t.Fatal("expected secretKeyRef to be converted")
		}
		if out.ValueFrom.SecretKeyRef.Name != "s" {
			t.Fatal("expected secret name preserved")
		}
	})

	t.Run("converts serviceRef", func(t *testing.T) {
		vs := arkv1prealpha1.ValueSource{
			ValueFrom: &arkv1prealpha1.ValueFromSource{
				ServiceRef: &arkv1prealpha1.ServiceReference{
					Name:      "svc",
					Namespace: "ns",
					Port:      "443",
					Path:      "/path",
				},
			},
		}
		out := convertV1PreAlpha1ValueSource(vs)
		if out.ValueFrom == nil || out.ValueFrom.ServiceRef == nil {
			t.Fatal("expected serviceRef to be converted")
		}
		if out.ValueFrom.ServiceRef.Name != "svc" || out.ValueFrom.ServiceRef.Port != "443" {
			t.Fatal("expected serviceRef fields preserved")
		}
	})
}
