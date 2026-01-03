/* Copyright 2025. McKinsey & Company */

// executionengine_controller_test.go contains unit tests for the ExecutionEngine controller.
//
// Key behaviors tested:
//   - specChanged: Detects when spec.source.image differs from status.imageRef
//     This ensures the controller re-processes an ExecutionEngine when its image is updated,
//     rather than returning early because status.phase is already "ready".

package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

// TestSpecChanged verifies that the specChanged function correctly detects
// when an ExecutionEngine's spec has changed from what's recorded in status.
//
// This is critical for the "image update" use case:
//   - User updates spec.source.image from "v1" to "v2"
//   - Controller must detect the change and update status.imageRef
//   - Without this check, the controller would return early (status=ready) and ignore the update
func TestSpecChanged(t *testing.T) {
	reconciler := &ExecutionEngineReconciler{}

	tests := []struct {
		name     string
		ee       *arkv1prealpha1.ExecutionEngine
		expected bool
	}{
		{
			// spec.source.image matches status.imageRef - no re-processing needed
			name: "no change - same image",
			ee: &arkv1prealpha1.ExecutionEngine{
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Source: &arkv1prealpha1.TemplateSource{
						Image: "my-image:v1",
					},
				},
				Status: arkv1prealpha1.ExecutionEngineStatus{
					ImageRef: "my-image:v1",
				},
			},
			expected: false,
		},
		{
			// User updated the image from v1 to v2 - controller must re-process
			name: "change detected - different image",
			ee: &arkv1prealpha1.ExecutionEngine{
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Source: &arkv1prealpha1.TemplateSource{
						Image: "my-image:v2",
					},
				},
				Status: arkv1prealpha1.ExecutionEngineStatus{
					ImageRef: "my-image:v1",
				},
			},
			expected: true,
		},
		{
			// Initial creation: spec has image but status.imageRef not yet set
			name: "change detected - image set, status empty",
			ee: &arkv1prealpha1.ExecutionEngine{
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Source: &arkv1prealpha1.TemplateSource{
						Image: "my-image:v1",
					},
				},
				Status: arkv1prealpha1.ExecutionEngineStatus{
					ImageRef: "",
				},
			},
			expected: true,
		},
		{
			// Address-based engine (no source) - spec change detection not applicable
			name: "no source - no change",
			ee: &arkv1prealpha1.ExecutionEngine{
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Source: nil,
				},
				Status: arkv1prealpha1.ExecutionEngineStatus{
					ImageRef: "some-image",
				},
			},
			expected: false,
		},
		{
			// Source exists but image is empty - waiting for git build or misconfigured
			name: "source with empty image - no change",
			ee: &arkv1prealpha1.ExecutionEngine{
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Source: &arkv1prealpha1.TemplateSource{
						Image: "",
					},
				},
				Status: arkv1prealpha1.ExecutionEngineStatus{
					ImageRef: "some-image",
				},
			},
			expected: false,
		},
		{
			// Git-based source - image is built externally and set in status.imageRef
			// We don't compare git URLs, only detect changes for direct image references
			name: "git source - no change detection",
			ee: &arkv1prealpha1.ExecutionEngine{
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Source: &arkv1prealpha1.TemplateSource{
						Git: &arkv1prealpha1.GitSource{
							URL: "https://github.com/example/repo",
						},
					},
				},
				Status: arkv1prealpha1.ExecutionEngineStatus{
					ImageRef: "built-image:sha123",
				},
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := reconciler.specChanged(tt.ee)
			assert.Equal(t, tt.expected, result)
		})
	}
}
