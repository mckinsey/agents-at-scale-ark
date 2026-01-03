/* Copyright 2025. McKinsey & Company */

// executionengine_webhook_test.go contains tests for ExecutionEngine admission validation.
//
// Test cases cover:
//   - Valid engines with address (shared executor mode)
//   - Valid engines with source image (template mode)
//   - Valid engines with source git (template mode)
//   - Invalid: neither address nor source
//   - Invalid: both address and source
//   - Invalid: source with neither image nor git
//   - Invalid: source with both image and git
//   - Invalid: reserved name "a2a"

package v1prealpha1

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
)

// TestExecutionEngineValidator_ValidateCreate tests the webhook validation logic
// for ExecutionEngine creation. Uses table-driven tests to cover all validation rules.
func TestExecutionEngineValidator_ValidateCreate(t *testing.T) {
	ctx := context.Background()

	scheme := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(scheme); err != nil {
		t.Fatalf("failed to add arkv1alpha1 to scheme: %v", err)
	}
	if err := arkv1prealpha1.AddToScheme(scheme); err != nil {
		t.Fatalf("failed to add arkv1prealpha1 to scheme: %v", err)
	}
	if err := corev1.AddToScheme(scheme); err != nil {
		t.Fatalf("failed to add corev1 to scheme: %v", err)
	}

	tests := []struct {
		name    string
		engine  *arkv1prealpha1.ExecutionEngine
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid engine with address",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type: "langchain",
					Address: &arkv1prealpha1.ValueSource{
						Value: "http://executor:8080",
					},
				},
			},
			wantErr: false,
		},
		{
			name: "valid engine with source image",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type:      "template",
					IsAgentic: true,
					Source: &arkv1prealpha1.TemplateSource{
						Image: "ghcr.io/org/my-agent:v1",
					},
				},
			},
			wantErr: false,
		},
		{
			name: "valid engine with source git",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type:      "template",
					IsAgentic: false,
					Source: &arkv1prealpha1.TemplateSource{
						Git: &arkv1prealpha1.GitSource{
							URL: "https://github.com/org/repo",
							Ref: "main",
						},
					},
				},
			},
			wantErr: false,
		},
		{
			name: "invalid - neither address nor source",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type: "langchain",
				},
			},
			wantErr: true,
			errMsg:  "must specify either address or source",
		},
		{
			name: "invalid - both address and source",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type: "langchain",
					Address: &arkv1prealpha1.ValueSource{
						Value: "http://executor:8080",
					},
					Source: &arkv1prealpha1.TemplateSource{
						Image: "ghcr.io/org/my-agent:v1",
					},
				},
			},
			wantErr: true,
			errMsg:  "cannot specify both address and source",
		},
		{
			name: "invalid - source with neither image nor git",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type:   "template",
					Source: &arkv1prealpha1.TemplateSource{},
				},
			},
			wantErr: true,
			errMsg:  "source must specify either image or git",
		},
		{
			name: "invalid - source with both image and git",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-engine",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type: "template",
					Source: &arkv1prealpha1.TemplateSource{
						Image: "ghcr.io/org/my-agent:v1",
						Git: &arkv1prealpha1.GitSource{
							URL: "https://github.com/org/repo",
						},
					},
				},
			},
			wantErr: true,
			errMsg:  "source cannot specify both image and git",
		},
		{
			name: "invalid - reserved name a2a",
			engine: &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "a2a",
					Namespace: "default",
				},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Type: "langchain",
					Address: &arkv1prealpha1.ValueSource{
						Value: "http://executor:8080",
					},
				},
			},
			wantErr: true,
			errMsg:  "reserved for A2A servers",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fakeClient := fake.NewClientBuilder().WithScheme(scheme).Build()
			validator := &ExecutionEngineValidator{
				Client:   fakeClient,
				Resolver: common.NewValueSourceResolverV1PreAlpha1(fakeClient),
			}

			_, err := validator.ValidateCreate(ctx, tt.engine)

			if tt.wantErr {
				if err == nil {
					t.Errorf("expected error containing %q, got nil", tt.errMsg)
					return
				}
				if tt.errMsg != "" && !contains(err.Error(), tt.errMsg) {
					t.Errorf("expected error containing %q, got %q", tt.errMsg, err.Error())
				}
			} else if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

// contains checks if substr is present in s. Used for error message matching.
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
