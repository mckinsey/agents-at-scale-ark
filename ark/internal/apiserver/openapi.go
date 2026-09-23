/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"embed"
	"encoding/json"
	"strings"
	"sync"

	k8sopenapi "k8s.io/apiextensions-apiserver/pkg/generated/openapi"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	openapicommon "k8s.io/kube-openapi/pkg/common"
	"k8s.io/kube-openapi/pkg/validation/spec"
	"sigs.k8s.io/yaml"
)

//go:embed crds/*.yaml
var crdFS embed.FS

// definitionsRefPrefix is the JSON-pointer prefix every OpenAPI $ref in the
// definitions map is keyed under.
const definitionsRefPrefix = "#/definitions/"

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

// objectMetaModelName and listMetaModelName are the canonical OpenAPI model
// names (e.g. io.k8s.apimachinery.pkg.apis.meta.v1.ObjectMeta) the apiserver
// keys its definitions and $refs under. Since k8s 0.37 the generated openapi
// map and ref callback both speak this canonical form via OpenAPIModelName(),
// so we use it directly instead of hand-converting Go import paths.
var (
	objectMetaModelName = metav1.ObjectMeta{}.OpenAPIModelName()
	listMetaModelName   = metav1.ListMeta{}.OpenAPIModelName()
)

func loadCRDDefinitions() {
	definitions = make(map[string]openapicommon.OpenAPIDefinition)

	// The generated k8s schemas embed their $refs by canonical model name, so
	// emit refs verbatim; re-deriving them would corrupt names the SMD
	// typeconverter later resolves at fieldmanager time.
	ref := func(name string) spec.Ref {
		return spec.MustCreateRef(definitionsRefPrefix + name)
	}
	for k, v := range k8sopenapi.GetOpenAPIDefinitions(ref) {
		definitions[k] = v
	}

	objectMetaRef := spec.Schema{
		SchemaProps: spec.SchemaProps{
			Ref: spec.MustCreateRef(definitionsRefPrefix + objectMetaModelName),
		},
	}
	listMetaRef := spec.Schema{
		SchemaProps: spec.SchemaProps{
			Ref: spec.MustCreateRef(definitionsRefPrefix + listMetaModelName),
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
			Dependencies: []string{objectMetaModelName},
		}

		listKey := resourceKey + "List"
		listDef := schemaForList(&schema, listMetaSchema)
		listDef.Dependencies = []string{
			listMetaModelName,
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
