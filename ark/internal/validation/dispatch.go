package validation

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func (v *Validator) Validate(ctx context.Context, obj runtime.Object) ([]string, error) {
	switch o := obj.(type) {
	case *arkv1alpha1.Agent:
		return v.ValidateAgent(ctx, o)
	case *arkv1alpha1.Model:
		return v.ValidateModel(ctx, o)
	case *arkv1alpha1.Tool:
		return ValidateTool(o)
	case *arkv1alpha1.Query:
		return v.ValidateQuery(ctx, o)
	case *arkv1alpha1.Team:
		return v.ValidateTeam(ctx, o)
	case *arkv1alpha1.MCPServer:
		return v.ValidateMCPServer(ctx, o)
	case *arkv1prealpha1.A2AServer:
		return ValidateA2AServer(o)
	case *arkv1prealpha1.ExecutionEngine:
		return v.ValidateExecutionEngine(ctx, o)
	}
	return nil, nil
}

func ApplyDefaults(obj runtime.Object) {
	switch o := obj.(type) {
	case *arkv1alpha1.Agent:
		DefaultAgent(o)
	case *arkv1alpha1.Model:
		DefaultModel(o)
	case *arkv1alpha1.Team:
		DefaultTeam(o)
	}
}
