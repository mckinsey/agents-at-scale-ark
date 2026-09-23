/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/kube-openapi/pkg/validation/spec"
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

// TestDefinitionsAreClosed reproduces, at unit level, the aggregated apiserver's
// "failed to install API group: unable to get openapi models: cannot find model
// definition for ..." startup failure. Every declared Dependency and every $ref
// embedded in a schema must resolve to a key in the map; a mismatch (e.g. a
// Go-style meta name after k8s moved to canonical OpenAPIModelName keys) only
// surfaces at apiserver boot in postgres mode, which unit and etcd tests miss.
func TestDefinitionsAreClosed(t *testing.T) {
	defs := GetOpenAPIDefinitions(nil)

	for name, def := range defs {
		for _, dep := range def.Dependencies {
			if _, ok := defs[dep]; !ok {
				t.Errorf("definition %q declares dependency %q missing from the definitions map", name, dep)
			}
		}
		for _, r := range collectRefs(&def.Schema) {
			if _, ok := defs[r]; !ok {
				t.Errorf("definition %q references %q missing from the definitions map", name, r)
			}
		}
	}
}

// collectRefs returns the definition names every $ref in the schema points at.
func collectRefs(s *spec.Schema) []string {
	if s == nil {
		return nil
	}
	var refs []string
	if ptr := s.Ref.GetPointer(); ptr != nil && !ptr.IsEmpty() {
		refs = append(refs, strings.TrimPrefix(s.Ref.String(), "#/definitions/"))
	}
	for i := range s.Properties {
		p := s.Properties[i]
		refs = append(refs, collectRefs(&p)...)
	}
	if s.Items != nil {
		refs = append(refs, collectRefs(s.Items.Schema)...)
		for i := range s.Items.Schemas {
			refs = append(refs, collectRefs(&s.Items.Schemas[i])...)
		}
	}
	if s.AdditionalProperties != nil {
		refs = append(refs, collectRefs(s.AdditionalProperties.Schema)...)
	}
	return refs
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

	// SSA fieldmanager looks up types by their canonical (reverse-domain) form,
	// e.g. io.k8s.apimachinery..., not the Go-style import path. The map keys
	// must match what the $ref strings use.
	objectMeta, ok := defs["io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta"]
	if !ok {
		t.Fatal("ObjectMeta definition not found under canonical name")
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
