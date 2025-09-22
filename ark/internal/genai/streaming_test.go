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
			configMap: &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "ark-config-streaming",
					Namespace: "default",
				},
				Data: map[string]string{
					"enabled": "true",
					"serviceRef": `name: ark-cluster-memory
port: "80"`,
				},
			},
			expectNil:     false,
			expectError:   false,
			expectEnabled: true,
		},
		{
			name: "valid config disabled",
			configMap: &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "ark-config-streaming",
					Namespace: "default",
				},
				Data: map[string]string{
					"enabled": "false",
					"serviceRef": `name: ark-cluster-memory
port: "80"`,
				},
			},
			expectNil:     false,
			expectError:   false,
			expectEnabled: false,
		},
		{
			name: "missing enabled field",
			configMap: &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "ark-config-streaming",
					Namespace: "default",
				},
				Data: map[string]string{
					"serviceRef": `name: ark-cluster-memory
port: "80"`,
				},
			},
			expectNil:   false,
			expectError: true,
		},
		{
			name: "missing serviceRef field when enabled",
			configMap: &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "ark-config-streaming",
					Namespace: "default",
				},
				Data: map[string]string{
					"enabled": "true",
				},
			},
			expectNil:   false,
			expectError: true,
		},
		{
			name: "invalid serviceRef YAML",
			configMap: &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "ark-config-streaming",
					Namespace: "default",
				},
				Data: map[string]string{
					"enabled":    "true",
					"serviceRef": "invalid: yaml: structure:",
				},
			},
			expectNil:   false,
			expectError: true,
		},
		{
			name: "serviceRef missing name",
			configMap: &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "ark-config-streaming",
					Namespace: "default",
				},
				Data: map[string]string{
					"enabled": "true",
					"serviceRef": `port: "8080"`,
				},
			},
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

			// Check expectations
			if tt.expectError && err == nil {
				t.Errorf("expected error but got nil")
			}
			if !tt.expectError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}

			if tt.expectNil && config != nil {
				t.Errorf("expected nil config but got %+v", config)
			}
			if !tt.expectNil && config == nil && !tt.expectError {
				t.Errorf("expected non-nil config but got nil")
			}

			if config != nil && config.Enabled != tt.expectEnabled {
				t.Errorf("expected enabled=%v but got %v", tt.expectEnabled, config.Enabled)
			}
		})
	}
}