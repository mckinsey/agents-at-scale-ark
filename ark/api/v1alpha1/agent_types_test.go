/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAgentTool_GetToolCRDName(t *testing.T) {
	const weatherToolName = "weather-tool"
	const exposedName = "exposed-name"
	const actualCRDName = "actual-crd-name"

	tests := []struct {
		name     string
		tool     AgentTool
		expected string
	}{
		{
			name: "returns tool name when no partial",
			tool: AgentTool{
				Name: weatherToolName,
			},
			expected: weatherToolName,
		},
		{
			name: "returns partial name when partial exists",
			tool: AgentTool{
				Name: exposedName,
				Partial: &ToolPartial{
					Name: actualCRDName,
				},
			},
			expected: actualCRDName,
		},
		{
			name: "returns tool name when partial name is empty",
			tool: AgentTool{
				Name: weatherToolName,
				Partial: &ToolPartial{
					Name: "",
				},
			},
			expected: weatherToolName,
		},
		{
			name: "returns tool name when partial is nil",
			tool: AgentTool{
				Name:    weatherToolName,
				Partial: nil,
			},
			expected: weatherToolName,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.tool.GetToolCRDName()
			require.Equal(t, tt.expected, result)
		})
	}
}
