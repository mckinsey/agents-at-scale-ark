package genai

import (
	"context"
	"encoding/json"
	"fmt"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

type PartialToolExecutor struct {
	BaseExecutor ToolExecutor
	Partial      *arkv1alpha1.ToolPartial
}

func (p *PartialToolExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	// Parse agent-provided arguments
	var agentParams map[string]any
	if call.Function.Arguments != "" {
		if err := json.Unmarshal([]byte(call.Function.Arguments), &agentParams); err != nil {
			return ToolResult{
				ID:    call.ID,
				Name:  call.Function.Name,
				Error: fmt.Sprintf("failed to parse arguments: %v", err),
			}, fmt.Errorf("failed to parse arguments: %w", err)
		}
	}

	mergedParams := map[string]any{}

	if p.Partial != nil {
		partialParams := map[string]any{}

		queryVal := ctx.Value(QueryContextKey)
		query, ok := queryVal.(*arkv1alpha1.Query)
		if !ok {
			return ToolResult{
				ID:    call.ID,
				Name:  call.Function.Name,
				Error: "failed to resolve query context for partial parameter template",
			}, fmt.Errorf("failed to resolve query context for partial parameter template")
		}

		// Prepare template data as {"Query": {paramName: paramValue, ...}}
		data := map[string]any{"Query": map[string]any{}}
		for _, p := range query.Spec.Parameters {
			data["Query"].(map[string]any)[p.Name] = p.Value
		}

		for _, param := range p.Partial.Parameters {
			resolved, err := common.ResolveTemplate(param.Value, data)
			if err != nil {
				return ToolResult{
					ID:    call.ID,
					Name:  call.Function.Name,
					Error: fmt.Sprintf("failed to resolve template for partial parameter '%s': %v", param.Name, err),
				}, fmt.Errorf("failed to resolve template for partial parameter '%s': %w", param.Name, err)
			}
			partialParams[param.Name] = resolved
		}

		for k, v := range partialParams {
			mergedParams[k] = v
		}
	}

	for k, v := range agentParams {
		mergedParams[k] = v
	}

	// Marshal merged params back to JSON
	argsBytes, err := json.Marshal(mergedParams)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("could not marshal merged arguments to JSON. Error: %v", err),
		}, fmt.Errorf("failed to marshal merged arguments to JSON. Error: %w", err)
	}
	call.Function.Arguments = string(argsBytes)
	return p.BaseExecutor.Execute(ctx, call)
}
