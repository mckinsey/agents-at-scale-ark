package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

type AgentDefaulter struct{}

func (d *AgentDefaulter) Default(ctx context.Context, obj runtime.Object) error {
	agent, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		return fmt.Errorf("expected an Agent object but got %T", obj)
	}

	_, isA2A := agent.Annotations[annotations.A2AServerName]
	hasModel := agent.Spec.ModelRef != nil

	if !hasModel && !isA2A {
		agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{
			Name: "default",
		}
	}

	for _, tool := range agent.Spec.Tools {
		if tool.Type == "custom" {
			if agent.Annotations == nil {
				agent.Annotations = make(map[string]string)
			}
			agent.Annotations[annotations.MigrationWarningPrefix+"tool-type-custom"] = fmt.Sprintf(
				"agent '%s' tool '%s': type 'custom' is deprecated, use the tool's actual type (mcp, http, agent, team, builtin) instead",
				agent.Name,
				tool.Name,
			)
			break
		}
	}

	return nil
}
