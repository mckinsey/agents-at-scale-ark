package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/itchyny/gojq"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type FilteredToolExecutor struct {
	BaseExecutor ToolExecutor
	Functions    []arkv1alpha1.ToolFunction
}

func (f *FilteredToolExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	result, err := f.BaseExecutor.Execute(ctx, call)
	if err != nil {
		return result, err
	}

	for _, fn := range f.Functions {
		filteredContent, err := f.applyFilter(result.Content, fn)
		if err != nil {
			return ToolResult{
				ID:    call.ID,
				Name:  call.Function.Name,
				Error: fmt.Sprintf("filter error: %v", err),
			}, fmt.Errorf("filter error: %w", err)
		}
		result.Content = filteredContent
	}

	return result, nil
}

func (f *FilteredToolExecutor) applyFilter(content string, fn arkv1alpha1.ToolFunction) (string, error) {
	switch fn.Name {
	case "jq":
		return f.applyJQFilter(content, fn.Value)
	default:
		return content, nil
	}
}

func (f *FilteredToolExecutor) applyJQFilter(content, jqExpr string) (string, error) {
	if jqExpr == "" {
		return content, nil
	}

	query, err := gojq.Parse(jqExpr)
	if err != nil {
		return "", fmt.Errorf("failed to parse jq expression '%s': %w", jqExpr, err)
	}

	var data interface{}
	if err := json.Unmarshal([]byte(content), &data); err != nil {
		return content, nil
	}

	iter := query.Run(data)
	var results []interface{}
	for {
		v, ok := iter.Next()
		if !ok {
			break
		}
		if err, ok := v.(error); ok {
			return "", fmt.Errorf("jq query execution error: %w", err)
		}
		results = append(results, v)
	}

	if len(results) == 0 {
		return "", nil
	}

	var output interface{}
	if len(results) == 1 {
		output = results[0]
	} else {
		output = results
	}

	filteredBytes, err := json.Marshal(output)
	if err != nil {
		return "", fmt.Errorf("failed to marshal filtered result: %w", err)
	}

	return string(filteredBytes), nil
}
