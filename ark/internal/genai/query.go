/* Copyright 2025. McKinsey & Company */

package genai

import (
	"encoding/json"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

type Query struct {
	Name        string
	Namespace   string
	Input       runtime.RawExtension
	Parameters  []arkv1alpha1.Parameter
	McpSettings map[string]MCPSettings
}

func getMCPSettings(crd *arkv1alpha1.Query) (map[string]MCPSettings, error) {
	mcpSettings := make(map[string]MCPSettings)

	if crd.Annotations == nil || crd.Annotations[annotations.MCPServerSettings] == "" {
		return mcpSettings, nil
	}

	err := json.Unmarshal([]byte(crd.Annotations[annotations.MCPServerSettings]), &mcpSettings)
	if err != nil {
		return nil, fmt.Errorf("failed to parse MCP annotations: %w", err)
	}

	return mcpSettings, nil
}

// IsStreamingEnabled checks if streaming is requested for a query
func IsStreamingEnabled(query arkv1alpha1.Query) bool {
	return query.GetAnnotations() != nil && query.GetAnnotations()[annotations.StreamingEnabled] == TrueString
}

func MakeQuery(crd *arkv1alpha1.Query) (*Query, error) {
	mcpSettings, err := getMCPSettings(crd)
	if err != nil {
		return nil, fmt.Errorf("failed to get MCP settings: %w", err)
	}

	return &Query{
		Name:        crd.Name,
		Namespace:   crd.Namespace,
		Input:       crd.Spec.Input,
		Parameters:  crd.Spec.Parameters,
		McpSettings: mcpSettings,
	}, nil
}
