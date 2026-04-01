/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

type ResourceDef struct {
	Kind         string
	Resource     string
	SingularName string
	Version      string
	NewFunc      func() runtime.Object
	NewListFunc  func() runtime.Object
}

var V1Alpha1Resources = []ResourceDef{
	{
		Kind: "Query", Resource: "queries", SingularName: "query", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.Query{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.QueryList{} },
	},
	{
		Kind: "Agent", Resource: "agents", SingularName: "agent", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.Agent{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.AgentList{} },
	},
	{
		Kind: "Model", Resource: "models", SingularName: "model", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.Model{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.ModelList{} },
	},
	{
		Kind: "Team", Resource: "teams", SingularName: "team", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.Team{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.TeamList{} },
	},
	{
		Kind: "Tool", Resource: "tools", SingularName: "tool", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.Tool{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.ToolList{} },
	},
	{
		Kind: "Memory", Resource: "memories", SingularName: "memory", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.Memory{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.MemoryList{} },
	},
	{
		Kind: "MCPServer", Resource: "mcpservers", SingularName: "mcpserver", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.MCPServer{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.MCPServerList{} },
	},
	{
		Kind: "A2ATask", Resource: "a2atasks", SingularName: "a2atask", Version: "v1alpha1",
		NewFunc: func() runtime.Object { return &arkv1alpha1.A2ATask{} }, NewListFunc: func() runtime.Object { return &arkv1alpha1.A2ATaskList{} },
	},
}

var V1PreAlpha1Resources = []ResourceDef{
	{
		Kind: "A2AServer", Resource: "a2aservers", SingularName: "a2aserver", Version: "v1prealpha1",
		NewFunc: func() runtime.Object { return &arkv1prealpha1.A2AServer{} }, NewListFunc: func() runtime.Object { return &arkv1prealpha1.A2AServerList{} },
	},
	{
		Kind: "ExecutionEngine", Resource: "executionengines", SingularName: "executionengine", Version: "v1prealpha1",
		NewFunc: func() runtime.Object { return &arkv1prealpha1.ExecutionEngine{} }, NewListFunc: func() runtime.Object { return &arkv1prealpha1.ExecutionEngineList{} },
	},
}

var AllResources = append(V1Alpha1Resources, V1PreAlpha1Resources...)

var resourceByKind = func() map[string]ResourceDef {
	m := make(map[string]ResourceDef, len(AllResources))
	for _, r := range AllResources {
		m[r.Kind] = r
	}
	return m
}()

func GetResourceByKind(kind string) (ResourceDef, bool) {
	r, ok := resourceByKind[kind]
	return r, ok
}
