/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"testing"
)

func TestV1Alpha1Resources(t *testing.T) {
	t.Parallel()
	if len(V1Alpha1Resources) == 0 {
		t.Fatal("V1Alpha1Resources should not be empty")
	}

	expectedKinds := []string{
		"Query", "Agent", "Model", "Team", "Tool",
		"Memory", "MCPServer", "Evaluation", "Evaluator", "A2ATask",
	}

	for _, kind := range expectedKinds {
		found := false
		for _, r := range V1Alpha1Resources {
			if r.Kind == kind {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("missing v1alpha1 resource: %s", kind)
		}
	}
}

func TestV1PreAlpha1Resources(t *testing.T) {
	t.Parallel()
	if len(V1PreAlpha1Resources) == 0 {
		t.Fatal("V1PreAlpha1Resources should not be empty")
	}

	expectedKinds := []string{"A2AServer", "ExecutionEngine"}

	for _, kind := range expectedKinds {
		found := false
		for _, r := range V1PreAlpha1Resources {
			if r.Kind == kind {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("missing v1prealpha1 resource: %s", kind)
		}
	}
}

func TestAllResources(t *testing.T) {
	t.Parallel()
	expectedTotal := len(V1Alpha1Resources) + len(V1PreAlpha1Resources)
	if len(AllResources) != expectedTotal {
		t.Errorf("AllResources has %d items, expected %d", len(AllResources), expectedTotal)
	}
}

func TestGetResourceByKind(t *testing.T) {
	t.Parallel()
	tests := []struct {
		kind        string
		wantFound   bool
		wantVersion string
	}{
		{"Agent", true, "v1alpha1"},
		{"Model", true, "v1alpha1"},
		{"Query", true, "v1alpha1"},
		{"A2AServer", true, "v1prealpha1"},
		{"ExecutionEngine", true, "v1prealpha1"},
		{"NonExistent", false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			res, found := GetResourceByKind(tt.kind)
			if found != tt.wantFound {
				t.Errorf("GetResourceByKind(%q) found = %v, want %v", tt.kind, found, tt.wantFound)
			}
			if found && res.Version != tt.wantVersion {
				t.Errorf("GetResourceByKind(%q) version = %q, want %q", tt.kind, res.Version, tt.wantVersion)
			}
		})
	}
}

func TestResourceDef_NewFunc(t *testing.T) {
	t.Parallel()
	for _, r := range AllResources {
		t.Run(r.Kind, func(t *testing.T) {
			obj := r.NewFunc()
			if obj == nil {
				t.Errorf("NewFunc() for %s returned nil", r.Kind)
			}
		})
	}
}

func TestResourceDef_NewListFunc(t *testing.T) {
	t.Parallel()
	for _, r := range AllResources {
		t.Run(r.Kind, func(t *testing.T) {
			obj := r.NewListFunc()
			if obj == nil {
				t.Errorf("NewListFunc() for %s returned nil", r.Kind)
			}
		})
	}
}

func TestResourceDef_Fields(t *testing.T) {
	t.Parallel()
	for _, r := range AllResources {
		t.Run(r.Kind, func(t *testing.T) {
			if r.Kind == "" {
				t.Error("Kind should not be empty")
			}
			if r.Resource == "" {
				t.Error("Resource should not be empty")
			}
			if r.SingularName == "" {
				t.Error("SingularName should not be empty")
			}
			if r.Version == "" {
				t.Error("Version should not be empty")
			}
		})
	}
}
