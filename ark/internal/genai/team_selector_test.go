/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"
	"text/template"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

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
		name           string
		legal          []string
		wantMembers    []string
		wantIndices    []int
		wantError      bool
		errorSubstring string
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
			wantMembers: []string{},
			wantIndices: []int{},
			wantError:   false, // Empty is valid, just returns empty list
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
		return MemberTypeAgent
	}
	return m.memberType
}

func (m *mockTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{}, nil
}

type mockSelectorAgent struct {
	response string
}

func newMockSelectorAgent(response ...string) *mockSelectorAgent {
	selected := "selected"
	if len(response) > 0 {
		selected = response[0]
	}
	return &mockSelectorAgent{response: selected}
}

func (m *mockSelectorAgent) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{
		Messages: []Message{
			NewAssistantMessage(m.response),
		},
	}, nil
}

func (m *mockSelectorAgent) FullName() string {
	return "mock-selector"
}

func (m *mockSelectorAgent) ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{
		A2AMessages: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart(m.response),
			}),
		},
	}, nil
}

func TestDetermineNextMember(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
		&mockTeamMember{name: "writer"},
		&mockTeamMember{name: "selected"},
	}

	tests := []struct {
		name             string
		previousMember   string
		legalTransitions map[string][]TeamMember
		wantMember       string
		wantError        bool
	}{
		{
			name:             "no graph constraints uses selector suggestion",
			previousMember:   "researcher",
			legalTransitions: map[string][]TeamMember{},
			wantMember:       "selected",
		},
		{
			name:           "single legal transition",
			previousMember: "researcher",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantMember: "analyst",
		},
		{
			name:           "multiple legal transitions",
			previousMember: "researcher",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1], members[3]},
			},
			wantMember: "selected",
		},
		{
			name:           "no legal transitions falls back to first",
			previousMember: "writer",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantMember: "researcher",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			team := &Team{
				Members: members,
			}
			team.mockSelectorAgent = newMockSelectorAgent()

			ctx := context.Background()
			messages := []Message{}
			tmpl, err := template.New("test").Parse("test template")
			require.NoError(t, err)

			member, err := team.determineNextMember(ctx, messages, tmpl, tt.previousMember, tt.legalTransitions)

			if tt.wantError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.NotNil(t, member)
			assert.Equal(t, tt.wantMember, member.GetName())
		})
	}
}

func TestDetermineNextMemberA2AUsesSelectorOnFirstTurn(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
		&mockTeamMember{name: "selected"},
	}
	team := &Team{Members: members}
	team.mockSelectorAgent = newMockSelectorAgent("selected")

	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	member, err := team.determineNextMemberA2A(context.Background(), nil, tmpl, "", map[string][]TeamMember{})
	require.NoError(t, err)
	require.NotNil(t, member)
	assert.Equal(t, "selected", member.GetName())
}

func TestSelectMemberA2AParsesNonExactSelectorOutput(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
	}
	team := &Team{Members: members}
	team.mockSelectorAgent = newMockSelectorAgent("The next participant should be: ANALYST")

	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	member, err := team.selectMemberA2A(context.Background(), nil, tmpl, buildParticipants(members), buildRoles(members), "", nil)
	require.NoError(t, err)
	require.NotNil(t, member)
	assert.Equal(t, "analyst", member.GetName())
}

func TestSelectFromGraphConstraints(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
		&mockTeamMember{name: "writer"},
		&mockTeamMember{name: "selected"},
	}

	tests := []struct {
		name             string
		previousMember   string
		legalTransitions map[string][]TeamMember
		wantMember       string
		wantError        bool
		errorSubstring   string
	}{
		{
			name:           "no previous member",
			previousMember: "",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantMember: "selected",
		},
		{
			name:           "no legal transitions",
			previousMember: "writer",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantMember: "researcher", // Falls back to first
		},
		{
			name:           "single legal transition",
			previousMember: "researcher",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantMember: "analyst",
		},
		{
			name:           "multiple legal transitions",
			previousMember: "researcher",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[2], members[3]},
			},
			wantMember: "selected",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			team := &Team{
				Members: members,
			}

			team.mockSelectorAgent = newMockSelectorAgent()

			ctx := context.Background()
			messages := []Message{}
			tmpl, err := template.New("test").Parse("test template")
			require.NoError(t, err)

			member, err := team.selectFromGraphConstraints(ctx, messages, tmpl, tt.previousMember, tt.legalTransitions)

			if tt.wantError {
				require.Error(t, err)
				if tt.errorSubstring != "" {
					assert.Contains(t, err.Error(), tt.errorSubstring)
				}
				return
			}

			require.NoError(t, err)
			require.NotNil(t, member)
			assert.Equal(t, tt.wantMember, member.GetName())
		})
	}
}

func TestBuildHistory(t *testing.T) {
	tests := []struct {
		name     string
		messages []Message
		want     string
	}{
		{
			name:     "empty messages",
			messages: []Message{},
			want:     "",
		},
		{
			name: "user message",
			messages: []Message{
				NewUserMessage("Hello"),
			},
			want: "# user:\nHello\n",
		},
		{
			name: "assistant message",
			messages: []Message{
				NewAssistantMessage("Hi there"),
			},
			want: "# assistant:\nHi there\n",
		},
		{
			name: "multiple messages",
			messages: []Message{
				NewUserMessage("Question?"),
				NewAssistantMessage("Answer"),
				NewUserMessage("Follow-up"),
			},
			want: "# user:\nQuestion?\n\n# assistant:\nAnswer\n\n# user:\nFollow-up\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildHistory(tt.messages)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestBuildParticipants(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
		&mockTeamMember{name: "writer"},
	}

	got := buildParticipants(members)
	want := "researcher, analyst, writer"
	assert.Equal(t, want, got)
}

func TestBuildRoles(t *testing.T) {
	tests := []struct {
		name    string
		members []TeamMember
		want    string
	}{
		{
			name: "members without descriptions",
			members: []TeamMember{
				&mockTeamMember{name: "researcher"},
				&mockTeamMember{name: "analyst"},
			},
			want: "researcher, analyst",
		},
		{
			name: "members with descriptions",
			members: []TeamMember{
				&mockTeamMember{name: "researcher", description: "Research specialist"},
				&mockTeamMember{name: "analyst", description: "Data analyst"},
			},
			want: "researcher: Research specialist, analyst: Data analyst",
		},
		{
			name: "mixed descriptions",
			members: []TeamMember{
				&mockTeamMember{name: "researcher", description: "Research specialist"},
				&mockTeamMember{name: "analyst"},
			},
			want: "researcher: Research specialist, analyst",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildRoles(tt.members)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestBuildA2AHistoryWithAgentNames(t *testing.T) {
	msg1 := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("what is the weather?"),
	})
	msg2 := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("checking weather data"),
	})
	setTeamExtension(&msg2, TeamExtensionV1{AgentName: "researcher"})
	msg3 := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("the weather is sunny"),
	})
	setTeamExtension(&msg3, TeamExtensionV1{AgentName: "writer"})

	history := buildA2AHistory([]protocol.Message{msg1, msg2, msg3})

	assert.Contains(t, history, "# user:\nwhat is the weather?")
	assert.Contains(t, history, "# researcher:\nchecking weather data")
	assert.Contains(t, history, "# writer:\nthe weather is sunny")
	assert.NotContains(t, history, "# assistant:")
}

func TestBuildA2AHistoryFallsBackToAssistantWithoutMetadata(t *testing.T) {
	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("response without name"),
	})

	history := buildA2AHistory([]protocol.Message{msg})

	assert.Contains(t, history, "# assistant:\nresponse without name")
}

func TestResolveSelectedMemberNamePrefersExplicitChoiceOverFirstMention(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyzer"},
	}

	selected := resolveSelectedMemberName(
		"I considered researcher, but I choose analyzer as the next respondent.",
		members,
	)

	assert.Equal(t, "analyzer", selected)
}
