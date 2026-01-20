package storage

import (
	"encoding/json"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

type ArkTypeConverter struct{}

func NewArkTypeConverter() *ArkTypeConverter {
	return &ArkTypeConverter{}
}

func (c *ArkTypeConverter) NewObject(kind string) runtime.Object {
	switch kind {
	case "Query":
		return &arkv1alpha1.Query{}
	case "Agent":
		return &arkv1alpha1.Agent{}
	case "Model":
		return &arkv1alpha1.Model{}
	case "Team":
		return &arkv1alpha1.Team{}
	case "Tool":
		return &arkv1alpha1.Tool{}
	case "Memory":
		return &arkv1alpha1.Memory{}
	case "MCPServer":
		return &arkv1alpha1.MCPServer{}
	case "Evaluation":
		return &arkv1alpha1.Evaluation{}
	case "Evaluator":
		return &arkv1alpha1.Evaluator{}
	case "A2ATask":
		return &arkv1alpha1.A2ATask{}
	case "A2AServer":
		return &arkv1prealpha1.A2AServer{}
	case "ExecutionEngine":
		return &arkv1prealpha1.ExecutionEngine{}
	default:
		return nil
	}
}

func (c *ArkTypeConverter) NewListObject(kind string) runtime.Object {
	switch kind {
	case "Query":
		return &arkv1alpha1.QueryList{}
	case "Agent":
		return &arkv1alpha1.AgentList{}
	case "Model":
		return &arkv1alpha1.ModelList{}
	case "Team":
		return &arkv1alpha1.TeamList{}
	case "Tool":
		return &arkv1alpha1.ToolList{}
	case "Memory":
		return &arkv1alpha1.MemoryList{}
	case "MCPServer":
		return &arkv1alpha1.MCPServerList{}
	case "Evaluation":
		return &arkv1alpha1.EvaluationList{}
	case "Evaluator":
		return &arkv1alpha1.EvaluatorList{}
	case "A2ATask":
		return &arkv1alpha1.A2ATaskList{}
	case "A2AServer":
		return &arkv1prealpha1.A2AServerList{}
	case "ExecutionEngine":
		return &arkv1prealpha1.ExecutionEngineList{}
	default:
		return nil
	}
}

func (c *ArkTypeConverter) Encode(obj runtime.Object) ([]byte, error) {
	return json.Marshal(obj)
}

func (c *ArkTypeConverter) Decode(kind string, data []byte) (runtime.Object, error) {
	obj := c.NewObject(kind)
	if obj == nil {
		return nil, fmt.Errorf("unknown kind: %s", kind)
	}

	if err := json.Unmarshal(data, obj); err != nil {
		return nil, fmt.Errorf("failed to unmarshal: %w", err)
	}

	return obj, nil
}
