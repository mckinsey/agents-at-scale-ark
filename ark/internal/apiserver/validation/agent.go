package validation

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type AgentValidator struct {
	*StorageValidator
}

func NewAgentValidator(sv *StorageValidator) *AgentValidator {
	return &AgentValidator{StorageValidator: sv}
}

func (v *AgentValidator) ValidateCreate(ctx context.Context, obj runtime.Object) error {
	agent, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		return fmt.Errorf("expected an Agent object but got %T", obj)
	}
	return v.validateAgent(ctx, agent)
}

func (v *AgentValidator) ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error {
	agent, ok := newObj.(*arkv1alpha1.Agent)
	if !ok {
		return fmt.Errorf("expected an Agent object but got %T", newObj)
	}
	return v.validateAgent(ctx, agent)
}

func (v *AgentValidator) ValidateDelete(ctx context.Context, obj runtime.Object) error {
	return nil
}

func (v *AgentValidator) validateAgent(ctx context.Context, agent *arkv1alpha1.Agent) error {
	if err := v.ValidateParameters(ctx, agent.Namespace, agent.Spec.Parameters); err != nil {
		return err
	}

	if err := ValidateOverrides(agent.Spec.Overrides); err != nil {
		return err
	}

	for i, tool := range agent.Spec.Tools {
		if err := v.validateTool(i, tool); err != nil {
			return err
		}
	}

	return nil
}

func (v *AgentValidator) validateTool(index int, tool arkv1alpha1.AgentTool) error {
	hasName := tool.Name != ""

	switch tool.Type {
	case "built-in":
		return v.validateBuiltInTool(tool, hasName, index)
	case "custom", "mcp", "http", "agent", "team", "builtin":
		return v.validateCustomTool(tool, hasName, index)
	default:
		return fmt.Errorf("tool[%d]: unsupported tool type '%s': supported types are: built-in, mcp, http, agent, team, builtin", index, tool.Type)
	}
}

func (v *AgentValidator) validateBuiltInTool(tool arkv1alpha1.AgentTool, hasName bool, index int) error {
	if !hasName {
		return fmt.Errorf("tool[%d]: built-in tools must specify a name", index)
	}
	if !isValidBuiltInTool(tool.Name) {
		return fmt.Errorf("tool[%d]: unsupported built-in tool '%s': supported built-in tools are: noop, terminate", index, tool.Name)
	}
	return nil
}

func (v *AgentValidator) validateCustomTool(tool arkv1alpha1.AgentTool, hasName bool, index int) error {
	if !hasName {
		return fmt.Errorf("tool[%d]: %s tools must specify a name", index, tool.Type)
	}
	return nil
}

func isValidBuiltInTool(name string) bool {
	validBuiltInTools := map[string]bool{
		"noop":      true,
		"terminate": true,
	}
	return validBuiltInTools[name]
}
