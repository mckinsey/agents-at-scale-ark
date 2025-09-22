/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

// Helper to create a test ConfigMap for streaming config
func createTestConfigMap(data map[string]string) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "ark-config-streaming",
			Namespace: "default",
		},
		Data: data,
	}
}

// Helper to verify test results
func verifyStreamingConfig(t *testing.T, config *StreamingConfig, err error, expectNil, expectError, expectEnabled bool) {
	t.Helper()

	if expectError && err == nil {
		t.Errorf("expected error but got nil")
	}
	if !expectError && err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if expectNil && config != nil {
		t.Errorf("expected nil config but got %+v", config)
	}
	if !expectNil && config == nil && !expectError {
		t.Errorf("expected non-nil config but got nil")
	}

	if config != nil && config.Enabled != expectEnabled {
		t.Errorf("expected enabled=%v but got %v", expectEnabled, config.Enabled)
	}
}

func TestGetStreamingConfig(t *testing.T) {
	tests := []struct {
		name          string
		configMap     *corev1.ConfigMap
		expectNil     bool
		expectError   bool
		expectEnabled bool
	}{
		{
			name:        "no configmap exists",
			configMap:   nil,
			expectNil:   true,
			expectError: false,
		},
		{
			name: "valid config enabled",
			configMap: createTestConfigMap(map[string]string{
				"enabled": "true",
				"serviceRef": `name: ark-cluster-memory
port: "http"`,
			}),
			expectNil:     false,
			expectError:   false,
			expectEnabled: true,
		},
		{
			name: "valid config disabled",
			configMap: createTestConfigMap(map[string]string{
				"enabled": "false",
				"serviceRef": `name: ark-cluster-memory
port: "http"`,
			}),
			expectNil:     false,
			expectError:   false,
			expectEnabled: false,
		},
		{
			name: "missing enabled field",
			configMap: createTestConfigMap(map[string]string{
				"serviceRef": `name: ark-cluster-memory
port: "http"`,
			}),
			expectNil:   false,
			expectError: true,
		},
		{
			name: "missing serviceRef field when enabled",
			configMap: createTestConfigMap(map[string]string{
				"enabled": "true",
			}),
			expectNil:   false,
			expectError: true,
		},
		{
			name: "invalid serviceRef YAML",
			configMap: createTestConfigMap(map[string]string{
				"enabled":    "true",
				"serviceRef": "invalid: yaml: structure:",
			}),
			expectNil:   false,
			expectError: true,
		},
		{
			name: "serviceRef missing name",
			configMap: createTestConfigMap(map[string]string{
				"enabled":    "true",
				"serviceRef": `port: "http"`,
			}),
			expectNil:   false,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create fake client
			scheme := runtime.NewScheme()
			_ = corev1.AddToScheme(scheme)

			objs := []runtime.Object{}
			if tt.configMap != nil {
				objs = append(objs, tt.configMap)
			}

			client := fake.NewClientBuilder().
				WithScheme(scheme).
				WithRuntimeObjects(objs...).
				Build()

			// Call GetStreamingConfig
			config, err := GetStreamingConfig(context.Background(), client, "default")

			// Check expectations using helper
			verifyStreamingConfig(t, config, err, tt.expectNil, tt.expectError, tt.expectEnabled)
		})
	}
}
