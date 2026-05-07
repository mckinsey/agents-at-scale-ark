/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"embed"
	"encoding/json"
	"strings"
	"sync"

	k8sopenapi "k8s.io/apiextensions-apiserver/pkg/generated/openapi"
	openapicommon "k8s.io/kube-openapi/pkg/common"
	"k8s.io/kube-openapi/pkg/validation/spec"
	"sigs.k8s.io/yaml"
)

//go:embed crds/*.yaml
var crdFS embed.FS

type crdFile struct {
	Spec struct {
		Names struct {
			Kind     string `json:"kind"`
			ListKind string `json:"listKind"`
		} `json:"names"`
		Versions []struct {
			Name   string `json:"name"`
			Schema struct {
				OpenAPIV3Schema json.RawMessage `json:"openAPIV3Schema"`
			} `json:"schema"`
		} `json:"versions"`
	} `json:"spec"`
}

var (
	loadOnce    sync.Once
	definitions map[string]openapicommon.OpenAPIDefinition
)

// canonicalName converts a Go import-path-style type name like
// "k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta" into the JSON-friendly form
// "io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta" that kube-apiserver and the
// SSA fieldmanager expect for $ref lookups. Without this conversion, our CRD
// schemas reference io.k8s... but the apiextensions-apiserver generator returns
// keys in Go-style — every UPDATE then logs "[SHOULD NOT HAPPEN] failed to update
// managedFields ... no type found matching: io.k8s..." silently corrupting SSA
// field-manager attribution.
func canonicalName(goImportName string) string {
	parts := strings.Split(goImportName, "/")
	if len(parts) > 0 && strings.Contains(parts[0], ".") {
		dotParts := strings.Split(parts[0], ".")
		// reverse domain segments (k8s.io -> io.k8s)
		for i, j := 0, len(dotParts)-1; i < j; i, j = i+1, j-1 {
			dotParts[i], dotParts[j] = dotParts[j], dotParts[i]
		}
		parts[0] = strings.Join(dotParts, ".")
	}
	return strings.Join(parts, ".")
}

func loadCRDDefinitions() {
	definitions = make(map[string]openapicommon.OpenAPIDefinition)

	// The ref callback drives every $ref string the auto-generated k8s schemas embed.
	// genericapiserver.BuildOpenAPIDefinitionsForResources stores schemas under
	// canonical reverse-domain names (e.g. io.k8s.apimachinery...) — if our $refs
	// embed Go-style names instead, the SMD typeconverter can't resolve them at
	// fieldmanager time and every Create/Update logs:
	//   [SHOULD NOT HAPPEN] failed to update managedFields ... no type found matching
	// Make the callback emit canonical refs so the embedded $refs match the keys
	// the spec components dict will actually use.
	ref := func(name string) spec.Ref {
		return spec.MustCreateRef("#/definitions/" + canonicalName(name))
	}
	k8sDefs := k8sopenapi.GetOpenAPIDefinitions(ref)
	// Register every k8s definition under both Go-style (used by the spec builder's
	// internal lookup `o.definitions[name]`) and canonical (used by the SMD lookup at
	// fieldmanager time). The two keys point at the same value.
	for k, v := range k8sDefs {
		definitions[k] = v
		if canonical := canonicalName(k); canonical != k {
			definitions[canonical] = v
		}
	}

	objectMetaRef := spec.Schema{
		SchemaProps: spec.SchemaProps{
			Ref: spec.MustCreateRef("#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta"),
		},
	}
	listMetaRef := spec.Schema{
		SchemaProps: spec.SchemaProps{
			Ref: spec.MustCreateRef("#/definitions/io.k8s.apimachinery.pkg.apis.meta.v1.ListMeta"),
		},
	}

	entries, err := crdFS.ReadDir("crds")
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		loadCRDFile(entry.Name(), &objectMetaRef, &listMetaRef)
	}
}

func loadCRDFile(filename string, objectMetaSchema, listMetaSchema *spec.Schema) {
	data, err := crdFS.ReadFile("crds/" + filename)
	if err != nil {
		return
	}

	var crd crdFile
	if err := yaml.Unmarshal(data, &crd); err != nil {
		return
	}

	for _, version := range crd.Spec.Versions {
		if len(crd.Spec.Names.Kind) == 0 || len(version.Schema.OpenAPIV3Schema) == 0 {
			continue
		}

		var schema spec.Schema
		if err := json.Unmarshal(version.Schema.OpenAPIV3Schema, &schema); err != nil {
			continue
		}

		if schema.Properties != nil {
			schema.Properties["metadata"] = *objectMetaSchema
		}

		resourceKey := "mckinsey.com/ark/api/" + version.Name + "." + crd.Spec.Names.Kind
		// Declare dependencies on the meta types we $ref. Without this,
		// kube-openapi/builder3.BuildOpenAPIDefinitionsForResources doesn't
		// recurse into ObjectMeta/ListMeta, the filtered spec it produces
		// for the SMD typeconverter is missing them, and every Create/Update
		// logs "[SHOULD NOT HAPPEN] failed to update managedFields ... no
		// type found matching: io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta".
		definitions[resourceKey] = openapicommon.OpenAPIDefinition{
			Schema:       schema,
			Dependencies: []string{"k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta"},
		}

		listKey := resourceKey + "List"
		listDef := schemaForList(&schema, listMetaSchema)
		listDef.Dependencies = []string{
			"k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta",
			resourceKey,
		}
		definitions[listKey] = listDef
	}
}

func GetOpenAPIDefinitions(ref openapicommon.ReferenceCallback) map[string]openapicommon.OpenAPIDefinition {
	loadOnce.Do(loadCRDDefinitions)
	return definitions
}

func schemaForList(itemSchema, listMetaSchema *spec.Schema) openapicommon.OpenAPIDefinition {
	return openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   *listMetaSchema,
					"items": {
						SchemaProps: spec.SchemaProps{
							Type:  []string{"array"},
							Items: &spec.SchemaOrArray{Schema: itemSchema},
						},
					},
				},
			},
		},
	}
}
