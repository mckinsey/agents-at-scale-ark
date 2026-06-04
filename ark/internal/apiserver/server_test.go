/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestScheme_InternalVersionsRegistered(t *testing.T) {
	t.Parallel()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	tests := []struct {
		name string
		obj  runtime.Object
	}{
		{"Agent", &arkv1alpha1.Agent{}},
		{"AgentList", &arkv1alpha1.AgentList{}},
		{"Team", &arkv1alpha1.Team{}},
		{"TeamList", &arkv1alpha1.TeamList{}},
		{"Query", &arkv1alpha1.Query{}},
		{"QueryList", &arkv1alpha1.QueryList{}},
		{"Model", &arkv1alpha1.Model{}},
		{"ModelList", &arkv1alpha1.ModelList{}},
		{"Tool", &arkv1alpha1.Tool{}},
		{"ToolList", &arkv1alpha1.ToolList{}},
		{"MCPServer", &arkv1alpha1.MCPServer{}},
		{"MCPServerList", &arkv1alpha1.MCPServerList{}},
		{"Memory", &arkv1alpha1.Memory{}},
		{"MemoryList", &arkv1alpha1.MemoryList{}},
		{"A2ATask", &arkv1alpha1.A2ATask{}},
		{"A2ATaskList", &arkv1alpha1.A2ATaskList{}},
		{"ArkConfig", &arkv1alpha1.ArkConfig{}},
		{"ArkConfigList", &arkv1alpha1.ArkConfigList{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gvks, _, err := Scheme.ObjectKinds(tt.obj)
			if err != nil {
				t.Fatalf("ObjectKinds() error = %v", err)
			}

			foundInternal := false
			for _, gvk := range gvks {
				if gvk.GroupVersion() == internalGV {
					foundInternal = true
					break
				}
			}

			if !foundInternal {
				t.Errorf("internal version not registered for %s, got GVKs: %v", tt.name, gvks)
			}
		})
	}
}

func TestScheme_InternalVersionsRegistered_PreAlpha(t *testing.T) {
	t.Parallel()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	tests := []struct {
		name string
		obj  runtime.Object
	}{
		{"A2AServer", &arkv1prealpha1.A2AServer{}},
		{"A2AServerList", &arkv1prealpha1.A2AServerList{}},
		{"ExecutionEngine", &arkv1prealpha1.ExecutionEngine{}},
		{"ExecutionEngineList", &arkv1prealpha1.ExecutionEngineList{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gvks, _, err := Scheme.ObjectKinds(tt.obj)
			if err != nil {
				t.Fatalf("ObjectKinds() error = %v", err)
			}

			foundInternal := false
			for _, gvk := range gvks {
				if gvk.GroupVersion() == internalGV {
					foundInternal = true
					break
				}
			}

			if !foundInternal {
				t.Errorf("internal version not registered for %s, got GVKs: %v", tt.name, gvks)
			}
		})
	}
}

func TestScheme_CanCreateInternalVersionObjects(t *testing.T) {
	t.Parallel()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	tests := []struct {
		kind string
		gvk  schema.GroupVersionKind
	}{
		{"Agent", internalGV.WithKind("Agent")},
		{"Team", internalGV.WithKind("Team")},
		{"Query", internalGV.WithKind("Query")},
		{"Model", internalGV.WithKind("Model")},
		{"A2AServer", internalGV.WithKind("A2AServer")},
		{"ExecutionEngine", internalGV.WithKind("ExecutionEngine")},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			obj, err := Scheme.New(tt.gvk)
			if err != nil {
				t.Fatalf("Scheme.New() for internal version error = %v", err)
			}
			if obj == nil {
				t.Error("expected non-nil object")
			}
		})
	}
}
