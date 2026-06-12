package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestAgentModelRefIndexer(t *testing.T) {
	tests := []struct {
		name     string
		agent    *arkv1alpha1.Agent
		expected []string
	}{
		{
			name:     "nil ModelRef returns nil",
			agent:    &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{ModelRef: nil}},
			expected: nil,
		},
		{
			name: "returns model name",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				ModelRef: &arkv1alpha1.AgentModelRef{Name: "gpt-4"},
			}},
			expected: []string{"gpt-4"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, agentModelRefIndexer(tt.agent))
		})
	}
}

func TestAgentExecutionEngineIndexer(t *testing.T) {
	tests := []struct {
		name     string
		agent    *arkv1alpha1.Agent
		expected []string
	}{
		{
			name:     "nil ExecutionEngine returns nil",
			agent:    &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{ExecutionEngine: nil}},
			expected: nil,
		},
		{
			name: "returns engine name",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "my-engine"},
			}},
			expected: []string{"my-engine"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, agentExecutionEngineIndexer(tt.agent))
		})
	}
}

func TestAgentToolNamesIndexer(t *testing.T) {
	tests := []struct {
		name     string
		agent    *arkv1alpha1.Agent
		expected []string
	}{
		{
			name:     "no tools returns nil",
			agent:    &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{}},
			expected: nil,
		},
		{
			name: "built-in tool is skipped",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "built-in", Name: "calculator"}},
			}},
			expected: nil,
		},
		{
			name: "custom tool name is indexed",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{Type: "custom", Name: "my-tool"}},
			}},
			expected: []string{"my-tool"},
		},
		{
			name: "partial tool indexes both exposed name and CRD name",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type:    "custom",
					Name:    "get-weather",
					Partial: &arkv1alpha1.ToolPartial{Name: "weather-api"},
				}},
			}},
			expected: []string{"get-weather", "weather-api"},
		},
		{
			name: "partial tool with no exposed name indexes only CRD name",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{{
					Type:    "custom",
					Partial: &arkv1alpha1.ToolPartial{Name: "weather-api"},
				}},
			}},
			expected: []string{"weather-api"},
		},
		{
			name: "multiple tools, built-in interleaved, all non-built-in are indexed",
			agent: &arkv1alpha1.Agent{Spec: arkv1alpha1.AgentSpec{
				Tools: []arkv1alpha1.AgentTool{
					{Type: "custom", Name: "tool-a"},
					{Type: "built-in", Name: "terminate"},
					{Type: "custom", Name: "tool-b"},
				},
			}},
			expected: []string{"tool-a", "tool-b"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.ElementsMatch(t, tt.expected, agentToolNamesIndexer(tt.agent))
		})
	}
}

func TestTeamAgentMemberIndexer(t *testing.T) {
	tests := []struct {
		name     string
		team     *arkv1alpha1.Team
		expected []string
	}{
		{
			name:     "no members returns nil",
			team:     &arkv1alpha1.Team{Spec: arkv1alpha1.TeamSpec{}},
			expected: nil,
		},
		{
			name: "non-agent members are skipped",
			team: &arkv1alpha1.Team{Spec: arkv1alpha1.TeamSpec{
				Members: []arkv1alpha1.TeamMember{{Type: "tool", Name: "my-tool"}},
			}},
			expected: nil,
		},
		{
			name: "agent members are indexed",
			team: &arkv1alpha1.Team{Spec: arkv1alpha1.TeamSpec{
				Members: []arkv1alpha1.TeamMember{
					{Type: "agent", Name: "agent-a"},
					{Type: "tool", Name: "tool-x"},
					{Type: "agent", Name: "agent-b"},
				},
			}},
			expected: []string{"agent-a", "agent-b"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, teamAgentMemberIndexer(tt.team))
		})
	}
}
