package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

type PartialToolExecutor struct {
	BaseExecutor ToolExecutor
	Partial      *arkv1alpha1.ToolPartial
	K8sClient    client.Client
	Namespace    string
}

func (p *PartialToolExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
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

		data := map[string]any{"Query": map[string]any{}}
		for _, qp := range query.Spec.Parameters {
			data["Query"].(map[string]any)[qp.Name] = qp.Value
		}

		for _, param := range p.Partial.Parameters {
			resolved, err := p.resolveParameter(ctx, param, data)
			if err != nil {
				return ToolResult{
					ID:    call.ID,
					Name:  call.Function.Name,
					Error: fmt.Sprintf("failed to resolve partial parameter '%s': %v", param.Name, err),
				}, fmt.Errorf("failed to resolve partial parameter '%s': %w", param.Name, err)
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

func (p *PartialToolExecutor) resolveParameter(ctx context.Context, param arkv1alpha1.ToolFunction, templateData map[string]any) (string, error) {
	if param.ValueFrom != nil {
		return resolveValueFrom(ctx, p.K8sClient, p.Namespace, param.ValueFrom)
	}
	return common.ResolveTemplate(param.Value, templateData)
}
