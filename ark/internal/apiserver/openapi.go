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

func loadCRDDefinitions() {
	definitions = make(map[string]openapicommon.OpenAPIDefinition)

	ref := func(name string) spec.Ref {
		return spec.MustCreateRef("#/definitions/" + name)
	}
	k8sDefs := k8sopenapi.GetOpenAPIDefinitions(ref)
	for k, v := range k8sDefs {
		definitions[k] = v
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
		definitions[resourceKey] = openapicommon.OpenAPIDefinition{Schema: schema}

		listKey := resourceKey + "List"
		definitions[listKey] = schemaForList(&schema, listMetaSchema)
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
