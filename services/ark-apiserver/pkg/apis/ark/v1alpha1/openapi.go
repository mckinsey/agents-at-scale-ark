package v1alpha1

import (
	"k8s.io/kube-openapi/pkg/common"
	"k8s.io/kube-openapi/pkg/validation/spec"
)

func GetOpenAPIDefinitions(ref common.ReferenceCallback) map[string]common.OpenAPIDefinition {
	return map[string]common.OpenAPIDefinition{
		"mckinsey.com/ark/api/v1alpha1.Query":          schemaQuery(ref),
		"mckinsey.com/ark/api/v1alpha1.QueryList":      schemaQueryList(ref),
		"mckinsey.com/ark/api/v1alpha1.QuerySpec":      schemaQuerySpec(ref),
		"mckinsey.com/ark/api/v1alpha1.QueryStatus":    schemaQueryStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Agent":          schemaGenericResource("Agent", ref),
		"mckinsey.com/ark/api/v1alpha1.AgentList":      schemaGenericResourceList("Agent", ref),
		"mckinsey.com/ark/api/v1alpha1.AgentSpec":      schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.AgentStatus":    schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Model":          schemaGenericResource("Model", ref),
		"mckinsey.com/ark/api/v1alpha1.ModelList":      schemaGenericResourceList("Model", ref),
		"mckinsey.com/ark/api/v1alpha1.ModelSpec":      schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.ModelStatus":    schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Team":           schemaGenericResource("Team", ref),
		"mckinsey.com/ark/api/v1alpha1.TeamList":       schemaGenericResourceList("Team", ref),
		"mckinsey.com/ark/api/v1alpha1.TeamSpec":       schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.TeamStatus":     schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Tool":           schemaGenericResource("Tool", ref),
		"mckinsey.com/ark/api/v1alpha1.ToolList":       schemaGenericResourceList("Tool", ref),
		"mckinsey.com/ark/api/v1alpha1.ToolSpec":       schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.ToolStatus":     schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Memory":         schemaGenericResource("Memory", ref),
		"mckinsey.com/ark/api/v1alpha1.MemoryList":     schemaGenericResourceList("Memory", ref),
		"mckinsey.com/ark/api/v1alpha1.MemorySpec":     schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.MemoryStatus":   schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.MCPServer":      schemaGenericResource("MCPServer", ref),
		"mckinsey.com/ark/api/v1alpha1.MCPServerList":  schemaGenericResourceList("MCPServer", ref),
		"mckinsey.com/ark/api/v1alpha1.MCPServerSpec":  schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.MCPServerStatus": schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Evaluation":      schemaGenericResource("Evaluation", ref),
		"mckinsey.com/ark/api/v1alpha1.EvaluationList":  schemaGenericResourceList("Evaluation", ref),
		"mckinsey.com/ark/api/v1alpha1.EvaluationSpec":  schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.EvaluationStatus": schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.Evaluator":       schemaGenericResource("Evaluator", ref),
		"mckinsey.com/ark/api/v1alpha1.EvaluatorList":   schemaGenericResourceList("Evaluator", ref),
		"mckinsey.com/ark/api/v1alpha1.EvaluatorSpec":   schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.EvaluatorStatus": schemaGenericStatus(ref),
		"mckinsey.com/ark/api/v1alpha1.A2ATask":         schemaGenericResource("A2ATask", ref),
		"mckinsey.com/ark/api/v1alpha1.A2ATaskList":     schemaGenericResourceList("A2ATask", ref),
		"mckinsey.com/ark/api/v1alpha1.A2ATaskSpec":     schemaGenericSpec(ref),
		"mckinsey.com/ark/api/v1alpha1.A2ATaskStatus":   schemaGenericStatus(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta":              schemaObjectMeta(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta":                schemaListMeta(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.TypeMeta":                schemaTypeMeta(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.APIGroup":                schemaAPIGroup(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.APIGroupList":            schemaAPIGroupList(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.Patch":                   schemaPatch(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.Status":                  schemaStatus(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.StatusDetails":           schemaStatusDetails(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.StatusCause":             schemaStatusCause(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.DeleteOptions":           schemaDeleteOptions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.Preconditions":           schemaPreconditions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.CreateOptions":           schemaCreateOptions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.UpdateOptions":           schemaUpdateOptions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.GetOptions":              schemaGetOptions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.ListOptions":             schemaListOptions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.PatchOptions":            schemaPatchOptions(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.WatchEvent":              schemaWatchEvent(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.APIResourceList":         schemaAPIResourceList(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.APIResource":             schemaAPIResource(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.GroupVersionForDiscovery": schemaGroupVersionForDiscovery(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.ServerAddressByClientCIDR": schemaServerAddressByClientCIDR(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.Table":                   schemaTable(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.TableColumnDefinition":   schemaTableColumnDefinition(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.TableRow":                schemaTableRow(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.PartialObjectMetadata":   schemaPartialObjectMetadata(ref),
		"k8s.io/apimachinery/pkg/apis/meta/v1.PartialObjectMetadataList": schemaPartialObjectMetadataList(ref),
		"k8s.io/apimachinery/pkg/version.Info":                         schemaVersionInfo(ref),
		"k8s.io/apimachinery/pkg/runtime.RawExtension":                 schemaRawExtension(ref),
	}
}

func schemaQuery(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Description: "Query represents an AI query request",
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
					"spec": {
						SchemaProps: spec.SchemaProps{
							Type: []string{"object"},
							Properties: map[string]spec.Schema{
								"type":           {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"input":          {SchemaProps: spec.SchemaProps{Type: []string{"object"}}},
								"serviceAccount": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"sessionId":      {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"conversationId": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"cancel":         {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
							},
						},
					},
					"status": {
						SchemaProps: spec.SchemaProps{
							Type: []string{"object"},
							Properties: map[string]spec.Schema{
								"phase":          {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"conversationId": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"tokenUsage":     {SchemaProps: spec.SchemaProps{Type: []string{"object"}}},
								"duration":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
								"error":          {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
							},
						},
					},
				},
			},
			VendorExtensible: spec.VendorExtensible{
				Extensions: spec.Extensions{
					"x-kubernetes-group-version-kind": []interface{}{
						map[string]interface{}{
							"group":   "ark.mckinsey.com",
							"version": "v1alpha1",
							"kind":    "Query",
						},
					},
				},
			},
		},
	}
}

func schemaQueryList(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Description: "QueryList is a list of Query resources",
				Type:        []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta")}},
					"items": {
						SchemaProps: spec.SchemaProps{
							Type: []string{"array"},
							Items: &spec.SchemaOrArray{
								Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("mckinsey.com/ark/api/v1alpha1.Query")}},
							},
						},
					},
				},
			},
			VendorExtensible: spec.VendorExtensible{
				Extensions: spec.Extensions{
					"x-kubernetes-group-version-kind": []interface{}{
						map[string]interface{}{
							"group":   "ark.mckinsey.com",
							"version": "v1alpha1",
							"kind":    "QueryList",
						},
					},
				},
			},
		},
	}
}

func schemaQuerySpec(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"type":           {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"input":          {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/runtime.RawExtension")}},
					"serviceAccount": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"sessionId":      {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"conversationId": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"cancel":         {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
				},
			},
		},
	}
}

func schemaQueryStatus(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"phase":          {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"conversationId": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaObjectMeta(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"name":              {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"namespace":         {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"uid":               {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"resourceVersion":   {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"generation":        {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
					"creationTimestamp": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"labels":            {SchemaProps: spec.SchemaProps{Type: []string{"object"}, AdditionalProperties: &spec.SchemaOrBool{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"annotations":       {SchemaProps: spec.SchemaProps{Type: []string{"object"}, AdditionalProperties: &spec.SchemaOrBool{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
				},
			},
		},
	}
}

func schemaListMeta(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"selfLink":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"resourceVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"continue":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaTypeMeta(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaRawExtension(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
			},
		},
	}
}

func schemaAPIGroup(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"name":             {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"versions":         {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}}}}}},
					"preferredVersion": {SchemaProps: spec.SchemaProps{Type: []string{"object"}}},
				},
			},
		},
	}
}

func schemaAPIGroupList(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"groups":     {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.APIGroup")}}}}},
				},
			},
		},
	}
}

func schemaPatch(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
			},
		},
	}
}

func schemaVersionInfo(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"major":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"minor":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"gitVersion":   {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"gitCommit":    {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"gitTreeState": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"buildDate":    {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"goVersion":    {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"compiler":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"platform":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaStatus(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Description: "Status is a return value for calls that don't return other objects",
				Type:        []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta")}},
					"status":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"message":    {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"reason":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"details":    {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.StatusDetails")}},
					"code":       {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
				},
			},
		},
	}
}

func schemaStatusDetails(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"name":              {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"group":             {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":              {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"uid":               {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"causes":            {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.StatusCause")}}}}},
					"retryAfterSeconds": {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
				},
			},
		},
	}
}

func schemaStatusCause(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"reason":  {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"message": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"field":   {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaDeleteOptions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":         {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":               {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"gracePeriodSeconds": {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
					"preconditions":      {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.Preconditions")}},
					"orphanDependents":   {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
					"propagationPolicy":  {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"dryRun":             {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
				},
			},
		},
	}
}

func schemaPreconditions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"uid":             {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"resourceVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaCreateOptions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":             {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"dryRun":           {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"fieldManager":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"fieldValidation":  {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaUpdateOptions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":             {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"dryRun":           {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"fieldManager":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"fieldValidation":  {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaGetOptions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":      {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":            {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"resourceVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaListOptions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":          {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":                {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"labelSelector":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"fieldSelector":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"watch":               {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
					"allowWatchBookmarks": {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
					"resourceVersion":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"resourceVersionMatch": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"timeoutSeconds":      {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
					"limit":               {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
					"continue":            {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaPatchOptions(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":             {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"dryRun":           {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"force":            {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
					"fieldManager":     {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"fieldValidation":  {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaWatchEvent(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"type":   {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"object": {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/runtime.RawExtension")}},
				},
			},
		},
	}
}

func schemaAPIResourceList(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":   {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":         {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"groupVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"resources":    {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.APIResource")}}}}},
				},
			},
		},
	}
}

func schemaAPIResource(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"name":               {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"singularName":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"namespaced":         {SchemaProps: spec.SchemaProps{Type: []string{"boolean"}}},
					"group":              {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"version":            {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":               {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"verbs":              {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"shortNames":         {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"categories":         {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"string"}}}}}},
					"storageVersionHash": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaGroupVersionForDiscovery(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"groupVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"version":      {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaServerAddressByClientCIDR(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"clientCIDR":    {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"serverAddress": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
				},
			},
		},
	}
}

func schemaTable(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":              {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":          {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta")}},
					"columnDefinitions": {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.TableColumnDefinition")}}}}},
					"rows":              {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.TableRow")}}}}},
				},
			},
		},
	}
}

func schemaTableColumnDefinition(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"name":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"type":        {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"format":      {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"description": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"priority":    {SchemaProps: spec.SchemaProps{Type: []string{"integer"}}},
				},
			},
		},
	}
}

func schemaTableRow(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"cells":      {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}}}}}},
					"conditions": {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Type: []string{"object"}}}}}},
					"object":     {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/runtime.RawExtension")}},
				},
			},
		},
	}
}

func schemaPartialObjectMetadata(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.ObjectMeta")}},
				},
			},
		},
	}
}

func schemaPartialObjectMetadataList(ref common.ReferenceCallback) common.OpenAPIDefinition {
	return common.OpenAPIDefinition{
		Schema: spec.Schema{
			SchemaProps: spec.SchemaProps{
				Type: []string{"object"},
				Properties: map[string]spec.Schema{
					"apiVersion": {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"kind":       {SchemaProps: spec.SchemaProps{Type: []string{"string"}}},
					"metadata":   {SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.ListMeta")}},
					"items":      {SchemaProps: spec.SchemaProps{Type: []string{"array"}, Items: &spec.SchemaOrArray{Schema: &spec.Schema{SchemaProps: spec.SchemaProps{Ref: ref("k8s.io/apimachinery/pkg/apis/meta/v1.PartialObjectMetadata")}}}}},
				},
			},
		},
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
							"version": "v1alpha1",
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
							"version": "v1alpha1",
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
