//nolint:goconst
package validation

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func TestCommonValidateParameters(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	lookup.addConfigMap("default", "cm1", map[string]string{"key": "val"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid parameter with value", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{Name: "p1", Value: "v1"}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects parameter without name", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{Value: "v"}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects parameter with both value and valueFrom", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name:      "p",
			Value:     "v",
			ValueFrom: &arkv1alpha1.ValueFromSource{},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects parameter with neither value nor valueFrom", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{Name: "p"}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("valid parameter with secretKeyRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s1"},
					Key:                  "key",
				},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid parameter with configMapKeyRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cm1"},
					Key:                  "key",
				},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid parameter with serviceRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{Name: "svc"},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects serviceRef without name", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error for serviceRef without name")
		}
	})

	t.Run("valid parameter with queryParameterRef", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				QueryParameterRef: &arkv1alpha1.QueryParameterReference{Name: "qp"},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects queryParameterRef without name", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				QueryParameterRef: &arkv1alpha1.QueryParameterReference{},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error for queryParameterRef without name")
		}
	})

	t.Run("rejects multiple valueFrom sources", func(t *testing.T) {
		params := []arkv1alpha1.Parameter{{
			Name: "p",
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s1"},
					Key:                  "key",
				},
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cm1"},
					Key:                  "key",
				},
			},
		}}
		err := v.ValidateParameters(ctx, "default", params)
		if err == nil {
			t.Fatal("expected error for multiple valueFrom sources")
		}
	})
}

func TestCommonValidateOverrides(t *testing.T) {
	t.Run("valid override with model type", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{
			ResourceType: "model",
			Headers:      []arkv1alpha1.Header{{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
		}}
		err := ValidateOverrides(overrides)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid override with mcpserver type", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{
			ResourceType: "mcpserver",
			Headers:      []arkv1alpha1.Header{{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v"}}},
		}}
		err := ValidateOverrides(overrides)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects invalid resourceType", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{ResourceType: "invalid"}}
		err := ValidateOverrides(overrides)
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects empty headers", func(t *testing.T) {
		overrides := []arkv1alpha1.Override{{ResourceType: "model"}}
		err := ValidateOverrides(overrides)
		if err == nil {
			t.Fatal("expected error for empty headers")
		}
	})
}

func TestCommonValidateHeader(t *testing.T) {
	t.Run("valid header", func(t *testing.T) {
		h := arkv1alpha1.Header{Name: "X-Key", Value: arkv1alpha1.HeaderValue{Value: "v"}}
		err := ValidateHeader(h, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects empty name", func(t *testing.T) {
		h := arkv1alpha1.Header{Value: arkv1alpha1.HeaderValue{Value: "v"}}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects empty value and valueFrom", func(t *testing.T) {
		h := arkv1alpha1.Header{Name: "X-Key", Value: arkv1alpha1.HeaderValue{}}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects both value and valueFrom", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				Value:     "v",
				ValueFrom: &arkv1alpha1.HeaderValueSource{},
			},
		}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("rejects valueFrom without any ref", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{},
			},
		}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error for valueFrom without refs")
		}
	})

	t.Run("rejects valueFrom with both refs", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					SecretKeyRef:    &corev1.SecretKeySelector{},
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{},
				},
			},
		}
		err := ValidateHeader(h, "test")
		if err == nil {
			t.Fatal("expected error for both refs")
		}
	})

	t.Run("valid header with secretKeyRef", func(t *testing.T) {
		h := arkv1alpha1.Header{
			Name: "X-Key",
			Value: arkv1alpha1.HeaderValue{
				ValueFrom: &arkv1alpha1.HeaderValueSource{
					SecretKeyRef: &corev1.SecretKeySelector{},
				},
			},
		}
		err := ValidateHeader(h, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCommonResolveValueSource(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("secret-val")})
	lookup.addConfigMap("default", "cm1", map[string]string{"key": "cm-val"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("resolves direct value", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{Value: "direct"}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "direct" {
			t.Fatalf("expected 'direct', got '%s'", val)
		}
	})

	t.Run("rejects empty source", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{}
		_, err := v.ResolveValueSource(ctx, vs, "default")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("resolves secretKeyRef", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "s1"},
					Key:                  "key",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "secret-val" {
			t.Fatalf("expected 'secret-val', got '%s'", val)
		}
	})

	t.Run("resolves configMapKeyRef", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "cm1"},
					Key:                  "key",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "cm-val" {
			t.Fatalf("expected 'cm-val', got '%s'", val)
		}
	})

	t.Run("resolves serviceRef", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{
					Name: "svc",
					Port: "8080",
					Path: "/api",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "http://svc.default.svc.cluster.local:8080/api" {
			t.Fatalf("unexpected URL: %s", val)
		}
	})

	t.Run("serviceRef uses https for port 443", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{
					Name:      "svc",
					Namespace: "custom-ns",
					Port:      "443",
				},
			},
		}
		val, err := v.ResolveValueSource(ctx, vs, "default")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if val != "https://svc.custom-ns.svc.cluster.local:443" {
			t.Fatalf("unexpected URL: %s", val)
		}
	})

	t.Run("rejects empty serviceRef name", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ServiceRef: &arkv1alpha1.ServiceReference{},
			},
		}
		_, err := v.ResolveValueSource(ctx, vs, "default")
		if err == nil {
			t.Fatal("expected error for empty service name")
		}
	})

	t.Run("rejects empty valueFrom", func(t *testing.T) {
		vs := arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{}}
		_, err := v.ResolveValueSource(ctx, vs, "default")
		if err == nil {
			t.Fatal("expected error for empty valueFrom")
		}
	})
}

func TestCommonCollectMigrationWarnings(t *testing.T) {
	t.Run("collects warnings", func(t *testing.T) {
		anns := map[string]string{
			annotations.MigrationWarningPrefix + "a": "warning a",
			annotations.MigrationWarningPrefix + "b": "warning b",
			"unrelated-annotation":                   "value",
		}
		warnings := CollectMigrationWarnings(anns)
		if len(warnings) != 2 {
			t.Fatalf("expected 2 warnings, got %d", len(warnings))
		}
	})

	t.Run("returns empty for no warnings", func(t *testing.T) {
		warnings := CollectMigrationWarnings(map[string]string{"key": "val"})
		if len(warnings) != 0 {
			t.Fatalf("expected 0 warnings, got %d", len(warnings))
		}
	})

	t.Run("handles nil annotations", func(t *testing.T) {
		warnings := CollectMigrationWarnings(nil)
		if len(warnings) != 0 {
			t.Fatalf("expected 0 warnings, got %d", len(warnings))
		}
	})
}

func TestCommonResourceExists(t *testing.T) {
	lookup := newMockLookup()
	lookup.addResource("Agent", "default", "exists", &arkv1alpha1.Agent{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("returns nil for empty name", func(t *testing.T) {
		err := v.ResourceExists(ctx, "Agent", "default", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns nil for existing resource", func(t *testing.T) {
		err := v.ResourceExists(ctx, "Agent", "default", "exists")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for nonexistent resource", func(t *testing.T) {
		err := v.ResourceExists(ctx, "Agent", "default", "nonexistent")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestCommonSecretKeyExists(t *testing.T) {
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("returns nil for empty name", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "", "key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns nil for empty key", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "s1", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for nonexistent secret", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "nonexistent", "key")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("returns error for missing key", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "s1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("returns nil for existing key", func(t *testing.T) {
		err := v.SecretKeyExists(ctx, "default", "s1", "key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCommonConfigMapKeyExists(t *testing.T) {
	lookup := newMockLookup()
	lookup.addConfigMap("default", "cm1", map[string]string{"key": "val"})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("returns nil for empty name", func(t *testing.T) {
		err := v.ConfigMapKeyExists(ctx, "default", "", "key")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for nonexistent configmap", func(t *testing.T) {
		err := v.ConfigMapKeyExists(ctx, "default", "nonexistent", "key")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("returns error for missing key", func(t *testing.T) {
		err := v.ConfigMapKeyExists(ctx, "default", "cm1", "missing")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestCommonValidateValueSource(t *testing.T) {
	lookup := newMockLookup()
	lookup.addSecret("default", "s1", map[string][]byte{"key": []byte("val")})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("nil source returns nil", func(t *testing.T) {
		err := v.ValidateValueSource(ctx, nil, "default", "field")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("source without valueFrom returns nil", func(t *testing.T) {
		err := v.ValidateValueSource(ctx, &arkv1alpha1.ValueSource{Value: "v"}, "default", "field")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("validates secretKeyRef", func(t *testing.T) {
		vs := &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "nonexistent"},
					Key:                  "key",
				},
			},
		}
		err := v.ValidateValueSource(ctx, vs, "default", "field")
		if err == nil {
			t.Fatal("expected error")
		}
	})

	t.Run("validates configMapKeyRef", func(t *testing.T) {
		vs := &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "nonexistent"},
					Key:                  "key",
				},
			},
		}
		err := v.ValidateValueSource(ctx, vs, "default", "field")
		if err == nil {
			t.Fatal("expected error")
		}
	})
}

func TestValidatePollInterval(t *testing.T) {
	t.Run("accepts zero", func(t *testing.T) {
		if err := ValidatePollInterval(0); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("accepts positive", func(t *testing.T) {
		if err := ValidatePollInterval(5 * time.Second); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects negative", func(t *testing.T) {
		if err := ValidatePollInterval(-1 * time.Second); err == nil {
			t.Fatal("expected error")
		}
	})
}
