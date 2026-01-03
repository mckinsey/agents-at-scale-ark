/* Copyright 2025. McKinsey & Company */

package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestToEnvVarName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple lowercase",
			input:    "foo",
			expected: "FOO",
		},
		{
			name:     "with dashes",
			input:    "my-config-value",
			expected: "MY_CONFIG_VALUE",
		},
		{
			name:     "with dots",
			input:    "my.config.value",
			expected: "MY_CONFIG_VALUE",
		},
		{
			name:     "mixed dashes and dots",
			input:    "my-config.value",
			expected: "MY_CONFIG_VALUE",
		},
		{
			name:     "already uppercase",
			input:    "MY_VALUE",
			expected: "MY_VALUE",
		},
		{
			name:     "openai-api-key",
			input:    "openai-api-key",
			expected: "OPENAI_API_KEY",
		},
		{
			name:     "target-language",
			input:    "target-language",
			expected: "TARGET_LANGUAGE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := toEnvVarName(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestBuildConfigEnvVars(t *testing.T) {
	reconciler := &AgentReconciler{}

	tests := []struct {
		name           string
		agent          *arkv1alpha1.Agent
		expectedEnvs   map[string]string
		unexpectedEnvs []string
	}{
		{
			name: "agent with no config",
			agent: &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-agent",
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{},
			},
			expectedEnvs: map[string]string{
				"ARK_AGENT_NAME":      "test-agent",
				"ARK_AGENT_NAMESPACE": "default",
			},
			unexpectedEnvs: []string{"ARK_CONFIG_"},
		},
		{
			name: "agent with config values",
			agent: &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "my-agent",
					Namespace: "production",
				},
				Spec: arkv1alpha1.AgentSpec{
					Config: map[string]string{
						"target-language": "Spanish",
						"openai-api-key":  "sk-test123",
					},
				},
			},
			expectedEnvs: map[string]string{
				"ARK_AGENT_NAME":      "my-agent",
				"ARK_AGENT_NAMESPACE": "production",
				"TARGET_LANGUAGE":     "Spanish",
				"OPENAI_API_KEY":      "sk-test123",
			},
			unexpectedEnvs: []string{"ARK_CONFIG_TARGET_LANGUAGE", "ARK_CONFIG_OPENAI_API_KEY"},
		},
		{
			name: "config with dots and dashes",
			agent: &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test",
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					Config: map[string]string{
						"my.config.value":  "value1",
						"another-value":    "value2",
						"mixed-value.here": "value3",
					},
				},
			},
			expectedEnvs: map[string]string{
				"MY_CONFIG_VALUE":  "value1",
				"ANOTHER_VALUE":    "value2",
				"MIXED_VALUE_HERE": "value3",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			envVars := reconciler.buildConfigEnvVars(tt.agent)

			envMap := make(map[string]string)
			for _, env := range envVars {
				envMap[env.Name] = env.Value
			}

			for expectedName, expectedValue := range tt.expectedEnvs {
				assert.Equal(t, expectedValue, envMap[expectedName],
					"expected env var %s to have value %s", expectedName, expectedValue)
			}

			for _, unexpectedEnv := range tt.unexpectedEnvs {
				for envName := range envMap {
					assert.NotContains(t, envName, unexpectedEnv,
						"env var %s should not contain %s", envName, unexpectedEnv)
				}
			}
		})
	}
}

func TestBuildConfigEnvVars_NoARKConfigPrefix(t *testing.T) {
	reconciler := &AgentReconciler{}

	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-agent",
			Namespace: "default",
		},
		Spec: arkv1alpha1.AgentSpec{
			Config: map[string]string{
				"foo-bar": "baz",
			},
		},
	}

	envVars := reconciler.buildConfigEnvVars(agent)

	for _, env := range envVars {
		if env.Name != "ARK_AGENT_NAME" && env.Name != "ARK_AGENT_NAMESPACE" {
			assert.NotContains(t, env.Name, "ARK_CONFIG_",
				"config env vars should not have ARK_CONFIG_ prefix, got %s", env.Name)
		}
	}

	envMap := envVarsToMap(envVars)
	assert.Equal(t, "baz", envMap["FOO_BAR"])
}

func envVarsToMap(envVars []corev1.EnvVar) map[string]string {
	result := make(map[string]string)
	for _, env := range envVars {
		result[env.Name] = env.Value
	}
	return result
}
