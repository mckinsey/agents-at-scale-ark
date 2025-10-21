package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"text/template"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type PartialToolExecutor struct {
	BaseExecutor ToolExecutor
	Partial      *arkv1alpha1.ToolPartial
}

// resolveTemplate resolves Go template strings using query parameters
func resolveTemplate(tmpl string, query *arkv1alpha1.Query) string {
	if tmpl == "" || query == nil {
		return tmpl
	}

	t, err := template.New("partial").Parse(tmpl)
	if err != nil {
		return tmpl
	}
	
	data := map[string]any{"Query": map[string]any{}}
	for _, p := range query.Spec.Parameters {
		data["Query"].(map[string]any)[p.Name] = p.Value
	}

	var result string

	err = t.Execute(&stringWriter{&result}, data)
	if err != nil {
		return tmpl
	}

	return result
}

type stringWriter struct {
	str *string
}

func (w *stringWriter) Write(p []byte) (int, error) {
	*w.str += string(p)
	return len(p), nil
}

func (p *PartialToolExecutor) Execute(ctx context.Context, call ToolCall, recorder EventEmitter) (ToolResult, error) {
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

	// Print partial params
	partialParams := map[string]any{}
	if p.Partial != nil {
		for _, param := range p.Partial.Parameters {
			// Defensive: handle panics if QueryContextKey is missing or wrong type
			var resolved string
			queryVal := ctx.Value(QueryContextKey)
			query, ok := queryVal.(*arkv1alpha1.Query)
			if !ok {
				return ToolResult{
					ID:    call.ID,
					Name:  call.Function.Name,
					Error: "failed to resolve query context for partial parameter template",
				}, fmt.Errorf("failed to resolve query context for partial parameter template")
			}
			resolved = resolveTemplate(param.Value, query)
			partialParams[param.Name] = resolved
		}
	}

	// Merge partial parameters
	merged := map[string]any{}

	for k, v := range partialParams {
		merged[k] = v
	}

	for k, v := range agentParams {
		merged[k] = v
	}

	// Marshal merged params back to JSON
	argsBytes, err := json.Marshal(merged)
	if err != nil {
		return ToolResult{
			ID:    call.ID,
			Name:  call.Function.Name,
			Error: fmt.Sprintf("could not marshal merged arguments to JSON. Error: %v", err),
		}, fmt.Errorf("failed to marshal merged arguments to JSON. Error: %w", err)
	}
	call.Function.Arguments = string(argsBytes)
	return p.BaseExecutor.Execute(ctx, call, recorder)
}
