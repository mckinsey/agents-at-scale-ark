/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/strategicpatch"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestNew_Defaults(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	if s.config.BindPort != 6443 {
		t.Errorf("BindPort = %d, want 6443", s.config.BindPort)
	}
	if s.config.AuthMode != AuthModeDelegated {
		t.Errorf("AuthMode = %q, want %q", s.config.AuthMode, AuthModeDelegated)
	}
}

func TestServer_Start_InvalidAuthMode(t *testing.T) {
	t.Parallel()

	s := New(Config{AuthMode: "bogus"})
	err := s.Start(context.Background())
	if err == nil {
		t.Fatal("expected error for invalid auth mode")
	}
	if !strings.Contains(err.Error(), "auth mode") {
		t.Errorf("error = %q, want mention of auth mode", err.Error())
	}
}

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

func applyStrategicMergePatch(t *testing.T, original runtime.Object, patchBytes []byte) runtime.Object {
	t.Helper()

	originalJSON, err := runtime.Encode(Codecs.LegacyCodec(arkv1alpha1.GroupVersion), original)
	if err != nil {
		t.Fatalf("failed to encode original: %v", err)
	}

	patchedJSON, err := strategicpatch.StrategicMergePatch(originalJSON, patchBytes, original)
	if err != nil {
		t.Fatalf("StrategicMergePatch() error = %v", err)
	}

	patched, err := runtime.Decode(Codecs.UniversalDecoder(arkv1alpha1.GroupVersion), patchedJSON)
	if err != nil {
		t.Fatalf("failed to decode patched object: %v", err)
	}

	return patched
}

func verifyInternalVersionRegistered(t *testing.T, obj runtime.Object) {
	t.Helper()

	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}

	gvks, _, err := Scheme.ObjectKinds(obj)
	if err != nil {
		t.Fatalf("ObjectKinds() error = %v", err)
	}

	for _, gvk := range gvks {
		if gvk.Group == internalGV.Group && gvk.Version == runtime.APIVersionInternal {
			return
		}
	}

	t.Errorf("internal version not recognized after patch, got GVKs: %v", gvks)
}

func TestScheme_StrategicMergePatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		original     runtime.Object
		patchBytes   []byte
		validateFunc func(t *testing.T, patched runtime.Object)
	}{
		{
			name: "Agent patch with null resourceVersion",
			original: &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:            "test-agent",
					Namespace:       "default",
					ResourceVersion: "123",
				},
				Spec: arkv1alpha1.AgentSpec{
					Description: "original",
				},
			},
			patchBytes: []byte(`{"spec":{"description":"patched"},"metadata":{"resourceVersion":null}}`),
			validateFunc: func(t *testing.T, patched runtime.Object) {
				agent := patched.(*arkv1alpha1.Agent)
				if agent.Spec.Description != "patched" {
					t.Errorf("expected description 'patched', got '%s'", agent.Spec.Description)
				}
			},
		},
		{
			name: "Model patch with null resourceVersion",
			original: &arkv1alpha1.Model{
				ObjectMeta: metav1.ObjectMeta{
					Name:            "test-model",
					Namespace:       "default",
					ResourceVersion: "456",
				},
				Spec: arkv1alpha1.ModelSpec{
					Provider: "openai",
				},
			},
			patchBytes: []byte(`{"spec":{"provider":"anthropic"},"metadata":{"resourceVersion":null}}`),
			validateFunc: func(t *testing.T, patched runtime.Object) {
				model := patched.(*arkv1alpha1.Model)
				if model.Spec.Provider != "anthropic" {
					t.Errorf("expected provider 'anthropic', got '%s'", model.Spec.Provider)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			patched := applyStrategicMergePatch(t, tt.original, tt.patchBytes)
			verifyInternalVersionRegistered(t, patched)
			tt.validateFunc(t, patched)
		})
	}
}
