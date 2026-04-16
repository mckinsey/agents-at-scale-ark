/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
)

func TestGetOpenAPIDefinitions(t *testing.T) {
	defs := GetOpenAPIDefinitions(nil)
	if len(defs) == 0 {
		t.Fatal("expected non-empty definitions")
	}

	expectedKinds := []string{
		"mckinsey.com/ark/api/v1alpha1.Query",
		"mckinsey.com/ark/api/v1alpha1.Agent",
		"mckinsey.com/ark/api/v1alpha1.Model",
		"mckinsey.com/ark/api/v1prealpha1.A2AServer",
	}

	for _, key := range expectedKinds {
		if _, ok := defs[key]; !ok {
			t.Errorf("missing definition for %s", key)
		}
	}

	t.Logf("Loaded %d definitions", len(defs))
}

func TestModelSchemaHasProperStructure(t *testing.T) {
	defs := GetOpenAPIDefinitions(nil)

	modelDef, ok := defs["mckinsey.com/ark/api/v1alpha1.Model"]
	if !ok {
		t.Fatal("Model definition not found")
	}

	props := modelDef.Schema.Properties
	if props == nil {
		t.Fatal("expected properties in Model schema")
	}

	if _, ok := props["spec"]; !ok {
		t.Error("Model schema missing 'spec' property")
	}
	if _, ok := props["status"]; !ok {
		t.Error("Model schema missing 'status' property")
	}
	if _, ok := props["metadata"]; !ok {
		t.Error("Model schema missing 'metadata' property")
	}

	specProps := props["spec"].Properties
	if specProps == nil {
		t.Fatal("expected properties in Model.spec")
	}

	if _, ok := specProps["provider"]; !ok {
		t.Error("Model.spec missing 'provider' field")
	}
	if _, ok := specProps["config"]; !ok {
		t.Error("Model.spec missing 'config' field")
	}

	t.Logf("Model.spec properties: %d", len(specProps))
	for name := range specProps {
		t.Logf("  spec.%s", name)
	}
}

func TestObjectMetaAnnotationsSchema(t *testing.T) {
	defs := GetOpenAPIDefinitions(nil)

	objectMeta, ok := defs["k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta"]
	if !ok {
		t.Fatal("ObjectMeta definition not found")
	}

	annotations, ok := objectMeta.Schema.Properties["annotations"]
	if !ok {
		t.Fatal("ObjectMeta missing 'annotations' property")
	}

	addlProps := annotations.AdditionalProperties
	if addlProps == nil || addlProps.Schema == nil {
		t.Fatal("annotations missing additionalProperties schema")
	}

	schemaType := addlProps.Schema.Type
	if len(schemaType) == 0 || schemaType[0] != "string" {
		t.Errorf("annotations additionalProperties type = %v, want [string]", schemaType)
	}
}

func TestAPIVersionByKind(t *testing.T) {
	conv := NewRegistryTypeConverter()

	tests := []struct {
		kind     string
		expected string
	}{
		{"Model", "ark.mckinsey.com/v1alpha1"},
		{"Query", "ark.mckinsey.com/v1alpha1"},
		{"Agent", "ark.mckinsey.com/v1alpha1"},
		{"A2AServer", "ark.mckinsey.com/v1prealpha1"},
		{"ExecutionEngine", "ark.mckinsey.com/v1prealpha1"},
	}

	for _, tt := range tests {
		got := conv.APIVersion(tt.kind)
		if got != tt.expected {
			t.Errorf("APIVersion(%q) = %q, want %q", tt.kind, got, tt.expected)
		}
	}
}

func TestJsonOnlyNegotiatedSerializerExcludesProtobuf(t *testing.T) {
	s := jsonOnlyNegotiatedSerializer{Codecs}
	for _, info := range s.SupportedMediaTypes() {
		if info.MediaType == runtime.ContentTypeProtobuf {
			t.Error("SupportedMediaTypes should not include protobuf")
		}
	}
}

func TestJsonOnlyNegotiatedSerializerIncludesJSON(t *testing.T) {
	s := jsonOnlyNegotiatedSerializer{Codecs}
	for _, info := range s.SupportedMediaTypes() {
		if info.MediaType == runtime.ContentTypeJSON {
			return
		}
	}
	t.Error("SupportedMediaTypes should include JSON")
}

func TestCodecsIncludesProtobufConfirmingFilterIsNeeded(t *testing.T) {
	for _, info := range Codecs.SupportedMediaTypes() {
		if info.MediaType == runtime.ContentTypeProtobuf {
			return
		}
	}
	t.Error("expected Codecs to include protobuf before filtering")
}
