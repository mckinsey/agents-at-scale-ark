package v1prealpha1

import (
	"k8s.io/kube-openapi/pkg/common"
	"k8s.io/kube-openapi/pkg/validation/spec"
)

func GetOpenAPIDefinitions(ref common.ReferenceCallback) map[string]common.OpenAPIDefinition {
	return map[string]common.OpenAPIDefinition{
		"mckinsey.com/ark/api/v1prealpha1.A2AServer":              schemaGenericResource("A2AServer", ref),
		"mckinsey.com/ark/api/v1prealpha1.A2AServerList":          schemaGenericResourceList("A2AServer", ref),
		"mckinsey.com/ark/api/v1prealpha1.A2AServerSpec":          schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1prealpha1.A2AServerStatus":        schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1prealpha1.ExecutionEngine":        schemaGenericResource("ExecutionEngine", ref),
		"mckinsey.com/ark/api/v1prealpha1.ExecutionEngineList":    schemaGenericResourceList("ExecutionEngine", ref),
		"mckinsey.com/ark/api/v1prealpha1.ExecutionEngineSpec":    schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1prealpha1.ExecutionEngineStatus":  schemaGenericStatus(ref),
	}
}

func schemaGenericResource(kind string, ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Description: kind + " resource",
				Type:        []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata": {
						SchemaProps: spec.SchemaProps{
							Type: []string{"object"},
							Properties: map[string]spec.Schema{
								"name":              {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"namespace":         {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"uid":               {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"resourceVersion":   {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"generation":        {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
								"creationTimestamp": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"deletionTimestamp": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"labels":            {SchemaProps: spec.SchemaProps{Type: []string{"object"}, AdditionalProperties: &spec.SchemaOrBool{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
								"annotations":       {SchemaProps: spec.SchemaProps{Type: []string{"object"}, AdditionalProperties: &spec.SchemaOrBool{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
								"finalizers":        {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
								"managedFields":     {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}}}}}},
							},
						},
					},
					"spec":   {SchemaProps: spec.SchemaProps{Type: []string{"object"}}},
					"status": {SchemaProps: spec.SchemaProps{Type: []string{"object"}}},
				},
			},
			VendorExtensible: spec.VendorExtensible{
				Extensions: spec.Extensions{
					"x-kubernetes-group-version-kind": []interface{}{
						map[string]interface{}{
							"group":   "ark.mckinsey.com",
							"version": "v1prealpha1",
							"kind":    kind,
						},
					},
				},
			},
		},
	}
}

func schemaGenericResourceList(kind string, ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Description: kind + "List is a list of " + kind + " resources",
				Type:        []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta")}},
					"items": {
						SchemaProps: spec.SchemaProps{
							Type:  []string{"array"},
							Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}}}},
						},
					},
				},
			},
			VendorExtensible: spec.VendorExtensible{
				Extensions: spec.Extensions{
					"x-kubernetes-group-version-kind": []interface{}{
						map[string]interface{}{
							"group":   "ark.mckinsey.com",
							"version": "v1prealpha1",
							"kind":    kind + "List",
						},
					},
				},
			},
		},
	}
}

func schemaGenericSpec(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
			},
		},
	}
}

func schemaGenericStatus(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
			},
		},
	}
}
