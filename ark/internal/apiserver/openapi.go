/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"embed"
	"encoding/json"
	"strings"
	"sync"

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

	addStandardK8sTypes(definitions)

	entries, err := crdFS.ReadDir("crds")
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		data, err := crdFS.ReadFile("crds/" + entry.Name())
		if err != nil {
			continue
		}

		var crd crdFile
		if err := yaml.Unmarshal(data, &crd); err != nil {
			continue
		}

		for _, version := range crd.Spec.Versions {
			if len(crd.Spec.Names.Kind) == 0 || len(version.Schema.OpenAPIV3Schema) == 0 {
				continue
			}

			var schema spec.Schema
			if err := json.Unmarshal(version.Schema.OpenAPIV3Schema, &schema); err != nil {
				continue
			}

			resourceKey := "mckinsey.com/ark/api/" + version.Name + "." + crd.Spec.Names.Kind
			definitions[resourceKey] = openapicommon.OpenAPIDefinition{Schema: schema}

			listKey := resourceKey + "List"
			definitions[listKey] = schemaForList(&schema)
		}
	}
}

func GetOpenAPIDefinitions(ref openapicommon.ReferenceCallback) map[string]openapicommon.OpenAPIDefinition {
	loadOnce.Do(loadCRDDefinitions)
	return definitions
}

func schemaForList(itemSchema *spec.Schema) openapicommon.OpenAPIDefinition {
	return openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   {SchemaProps: spec.SchemaProps{Type: []string{"object"}}},
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

func addStandardK8sTypes(defs map[string]openapicommon.OpenAPIDefinition) {
	objectSchema := spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}}}
	stringSchema := spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}
	intSchema := spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"integer"}}}
	arrayOfStrings := spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &stringSchema}}}

	defs["k8s.io/apimachinery/pkg/version.Info"] = openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}, Properties: map[string]spec.Schema{
			"major": stringSchema, "minor": stringSchema, "gitVersion": stringSchema, "gitCommit": stringSchema,
			"gitTreeState": stringSchema, "buildDate": stringSchema, "goVersion": stringSchema, "compiler": stringSchema, "platform": stringSchema,
		}}},
	}

	defs["k8s.io/apimachinery/pkg/apis/meta/v1.APIGroupList"] = openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}, Properties: map[string]spec.Schema{
			"apiVersion": stringSchema, "kind": stringSchema, "groups": {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &objectSchema}}},
		}}},
	}

	defs["k8s.io/apimachinery/pkg/apis/meta/v1.APIGroup"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.APIVersions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.APIResourceList"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.Status"] = openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}, Properties: map[string]spec.Schema{
			"apiVersion": stringSchema, "kind": stringSchema, "metadata": objectSchema, "status": stringSchema, "message": stringSchema, "reason": stringSchema, "code": intSchema,
		}}},
	}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta"] = openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}, Properties: map[string]spec.Schema{
			"name": stringSchema, "namespace": stringSchema, "uid": stringSchema, "resourceVersion": stringSchema,
			"generation": intSchema, "creationTimestamp": stringSchema, "deletionTimestamp": stringSchema,
			"labels": objectSchema, "annotations": objectSchema, "finalizers": arrayOfStrings,
		}}},
	}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta"] = openapicommon.OpenAPIDefinition{
		Schema: spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}, Properties: map[string]spec.Schema{
			"selfLink": stringSchema, "resourceVersion": stringSchema, "continue": stringSchema, "remainingItemCount": intSchema,
		}}},
	}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.Time"] = openapicommon.OpenAPIDefinition{Schema: stringSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.MicroTime"] = openapicommon.OpenAPIDefinition{Schema: stringSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.Duration"] = openapicommon.OpenAPIDefinition{Schema: stringSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.Patch"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.DeleteOptions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.CreateOptions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.UpdateOptions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.GetOptions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.ListOptions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.PatchOptions"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/apis/meta/v1.WatchEvent"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/runtime.RawExtension"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/runtime.Unknown"] = openapicommon.OpenAPIDefinition{Schema: objectSchema}
	defs["k8s.io/apimachinery/pkg/util/intstr.IntOrString"] = openapicommon.OpenAPIDefinition{Schema: stringSchema}
}
