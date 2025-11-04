/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestBuildLegalTransitions(t *testing.T) {
	tests := []struct {
		name      string
		graph     *arkv1alpha1.TeamGraphSpec
		want      map[string][]string
		wantEmpty bool
	}{
		{
			name: "single edge",
			graph: &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
				},
			},
			want: map[string][]string{
				"researcher": {"analyst"},
			},
		},
		{
			name: "multiple edges from same source",
			graph: &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
					{From: "researcher", To: "writer"},
					{From: "analyst", To: "writer"},
				},
			},
			want: map[string][]string{
				"researcher": {"analyst", "writer"},
				"analyst":    {"writer"},
			},
		},
		{
			name:      "no graph",
			graph:     nil,
			wantEmpty: true,
		},
		{
			name: "empty edges",
			graph: &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{},
			},
			wantEmpty: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			legalTransitions := make(map[string][]string)
			if tt.graph != nil {
				for _, edge := range tt.graph.Edges {
					legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
				}
			}

			if tt.wantEmpty {
				assert.Empty(t, legalTransitions, "expected empty legal transitions")
			} else {
				require.Equal(t, tt.want, legalTransitions, "legal transitions should match expected")
			}
		})
	}
}

func TestFilterMembersByLegalTransitions(t *testing.T) {
	// Create mock team members
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
		&mockTeamMember{name: "writer"},
		&mockTeamMember{name: "reviewer"},
	}

	memberMap := make(map[string]TeamMember)
	memberIndexMap := make(map[string]int)
	for i, member := range members {
		memberMap[member.GetName()] = member
		memberIndexMap[member.GetName()] = i
	}

	tests := []struct {
		name            string
		legal           []string
		wantMembers     []string
		wantIndices     []int
		wantError       bool
		errorSubstring  string
	}{
		{
			name:        "single legal transition",
			legal:       []string{"analyst"},
			wantMembers: []string{"analyst"},
			wantIndices: []int{1},
		},
		{
			name:        "multiple legal transitions",
			legal:       []string{"analyst", "writer"},
			wantMembers: []string{"analyst", "writer"},
			wantIndices: []int{1, 2},
		},
		{
			name:        "all members legal",
			legal:       []string{"researcher", "analyst", "writer", "reviewer"},
			wantMembers: []string{"researcher", "analyst", "writer", "reviewer"},
			wantIndices: []int{0, 1, 2, 3},
		},
		{
			name:           "invalid member name",
			legal:          []string{"nonexistent"},
			wantMembers:    []string{},
			wantIndices:    []int{},
			wantError:      true,
			errorSubstring: "no valid members found",
		},
		{
			name:        "empty legal transitions",
			legal:       []string{},
			wantMembers:  []string{},
			wantIndices:  []int{},
			wantError:    false, // Empty is valid, just returns empty list
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			candidateMembers := make([]TeamMember, 0, len(tt.legal))
			candidateIndices := make([]int, 0, len(tt.legal))
			for _, legalName := range tt.legal {
				if member, exists := memberMap[legalName]; exists {
					candidateMembers = append(candidateMembers, member)
					candidateIndices = append(candidateIndices, memberIndexMap[legalName])
				}
			}

			if tt.wantError {
				assert.Empty(t, candidateMembers, "should have no candidate members on error")
				assert.Empty(t, candidateIndices, "should have no candidate indices on error")
			} else {
				require.Equal(t, len(tt.wantMembers), len(candidateMembers), "candidate members count should match")
				for i, wantName := range tt.wantMembers {
					assert.Equal(t, wantName, candidateMembers[i].GetName(), "member name should match")
				}
				require.Equal(t, tt.wantIndices, candidateIndices, "candidate indices should match")
			}
		})
	}
}

// mockTeamMember implements TeamMember interface for testing
type mockTeamMember struct {
	name        string
	description string
	memberType  string
}

func (m *mockTeamMember) GetName() string {
	return m.name
}

func (m *mockTeamMember) GetDescription() string {
	if m.description == "" {
		return ""
	}
	return m.description
}

func (m *mockTeamMember) GetType() string {
	if m.memberType == "" {
		return "agent"
	}
	return m.memberType
}

func (m *mockTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) ([]Message, error) {
	return nil, nil
}

