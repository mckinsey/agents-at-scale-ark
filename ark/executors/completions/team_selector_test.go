/* Copyright 2025. McKinsey & Company */

package completions

import (
	"context"
	"errors"
	"testing"
	"text/template"

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
			name:           "no legal transitions terminates team",
			previousMember: "writer",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantError: true,
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
				assert.True(t, IsTerminateTeam(err), "expected TerminateTeam error")
				assert.Nil(t, member, "member should be nil on error")
				return
			}

			require.NoError(t, err)
			require.NotNil(t, member)
			assert.Equal(t, tt.wantMember, member.GetName())
		})
	}
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
			name:           "no legal transitions terminates team",
			previousMember: "writer",
			legalTransitions: map[string][]TeamMember{
				"researcher": {members[1]},
			},
			wantError:      true,
			errorSubstring: "no onward transitions",
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
				assert.True(t, IsTerminateTeam(err), "expected TerminateTeam error")
				assert.Nil(t, member, "member should be nil on error")
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
			want: "# :\nHi there\n",
		},
		{
			name: "multiple messages",
			messages: []Message{
				NewUserMessage("Question?"),
				NewAssistantMessage("Answer"),
				NewUserMessage("Follow-up"),
			},
			want: "# user:\nQuestion?\n\n# :\nAnswer\n\n# user:\nFollow-up\n",
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

func TestSetupSelectorTemplate(t *testing.T) {
	tests := []struct {
		name         string
		selectorSpec *arkv1alpha1.TeamSelectorSpec
		wantError    bool
		wantContains string
	}{
		{
			name:         "uses default prompt when no selector spec",
			selectorSpec: nil,
			wantContains: "role play game",
		},
		{
			name: "uses custom prompt when provided",
			selectorSpec: &arkv1alpha1.TeamSelectorSpec{
				SelectorPrompt: "Custom selector: {{.Participants}}",
			},
			wantContains: "Custom selector",
		},
		{
			name: "returns error for invalid template",
			selectorSpec: &arkv1alpha1.TeamSelectorSpec{
				SelectorPrompt: "Invalid {{.Unclosed",
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			team := &Team{
				Selector: tt.selectorSpec,
			}

			tmpl, err := team.setupSelectorTemplate()

			if tt.wantError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			require.NotNil(t, tmpl)

			executed, err := tmpl.Parse(tt.wantContains)
			require.NoError(t, err)
			assert.Contains(t, executed.Root.String(), tt.wantContains)
		})
	}
}

func TestBuildLegalTransitionsMap(t *testing.T) {
	tests := []struct {
		name     string
		members  []TeamMember
		graph    *arkv1alpha1.TeamGraphSpec
		wantLen  int
		validate func(t *testing.T, result map[string][]TeamMember)
	}{
		{
			name: "no graph returns empty map",
			members: []TeamMember{
				&mockTeamMember{name: "agent1"},
			},
			graph:   nil,
			wantLen: 0,
		},
		{
			name: "builds transitions from graph edges",
			members: []TeamMember{
				&mockTeamMember{name: "researcher"},
				&mockTeamMember{name: "analyst"},
				&mockTeamMember{name: "writer"},
			},
			graph: &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
					{From: "analyst", To: "writer"},
				},
			},
			wantLen: 2,
			validate: func(t *testing.T, result map[string][]TeamMember) {
				require.Len(t, result["researcher"], 1)
				assert.Equal(t, "analyst", result["researcher"][0].GetName())
				require.Len(t, result["analyst"], 1)
				assert.Equal(t, "writer", result["analyst"][0].GetName())
			},
		},
		{
			name: "ignores edges to nonexistent members",
			members: []TeamMember{
				&mockTeamMember{name: "researcher"},
			},
			graph: &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "nonexistent"},
				},
			},
			wantLen: 0,
		},
		{
			name: "handles multiple edges from same source",
			members: []TeamMember{
				&mockTeamMember{name: "researcher"},
				&mockTeamMember{name: "analyst"},
				&mockTeamMember{name: "writer"},
			},
			graph: &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
					{From: "researcher", To: "writer"},
				},
			},
			wantLen: 1,
			validate: func(t *testing.T, result map[string][]TeamMember) {
				require.Len(t, result["researcher"], 2)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			team := &Team{
				Members: tt.members,
				Graph:   tt.graph,
			}

			result := team.buildLegalTransitionsMap()

			assert.Len(t, result, tt.wantLen)
			if tt.validate != nil {
				tt.validate(t, result)
			}
		})
	}
}

func TestHandleMemberSelectionError(t *testing.T) {
	tests := []struct {
		name                string
		err                 error
		wantTerminate       bool
		wantReturnErr       bool
		wantMessagesAdded   int
		wantMessageContains string
	}{
		{
			name:                "InvalidAgentError adds warning message",
			err:                 &InvalidAgentError{SelectedName: "wrong-agent"},
			wantTerminate:       true,
			wantReturnErr:       false,
			wantMessagesAdded:   1,
			wantMessageContains: "wrong-agent",
		},
		{
			name:              "TerminateTeam error triggers termination",
			err:               &TerminateTeam{},
			wantTerminate:     true,
			wantReturnErr:     false,
			wantMessagesAdded: 0,
		},
		{
			name:              "regular error returned as-is",
			err:               errors.New("some error"),
			wantTerminate:     false,
			wantReturnErr:     true,
			wantMessagesAdded: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			team := &Team{}
			var newMessages []Message
			ctx := context.Background()

			shouldTerminate, returnErr := team.handleMemberSelectionError(ctx, tt.err, &newMessages)

			assert.Equal(t, tt.wantTerminate, shouldTerminate)
			if tt.wantReturnErr {
				assert.Error(t, returnErr)
			} else {
				assert.NoError(t, returnErr)
			}
			assert.Len(t, newMessages, tt.wantMessagesAdded)
			if tt.wantMessageContains != "" && len(newMessages) > 0 {
				content := newMessages[0].OfSystem.Content.OfString.Value
				assert.Contains(t, content, tt.wantMessageContains)
			}
		})
	}
}

func TestInvalidAgentError(t *testing.T) {
	err := &InvalidAgentError{SelectedName: "invalid-agent"}
	errMsg := err.Error()
	assert.Equal(t, errMsg, "Selector returned invalid agent name: invalid-agent", "Wrong error message from InvalidAgent")
}

func TestStartTurnTelemetry(t *testing.T) {
	mockTelemetry := &mockTeamRecorder{}
	mockEventing := &mockEventingRecorder{}

	team := &Team{
		Name:              "test-team",
		Strategy:          "selector",
		telemetryRecorder: mockTelemetry,
		eventingRecorder:  mockEventing,
	}

	ctx := context.Background()
	turnCtx, tel := team.startTurnTelemetry(ctx, 5, "test-agent", "agent")

	assert.True(t, mockTelemetry.startTurnCalled)
	assert.Equal(t, 5, mockTelemetry.lastTurn)
	assert.Equal(t, "test-agent", mockTelemetry.lastMemberName)
	assert.Equal(t, "agent", mockTelemetry.lastMemberType)
	assert.True(t, mockEventing.startCalled)
	assert.Equal(t, "TeamTurn", mockEventing.lastOperation)
	assert.Equal(t, 5, tel.turnNum)
	assert.NotNil(t, tel.span)
	assert.NotNil(t, turnCtx)
	assert.Contains(t, tel.opData, "teamName")
	assert.Equal(t, "test-team", tel.opData["teamName"])
}

func TestRecordTurnOutput(t *testing.T) {
	tests := []struct {
		name             string
		messages         []Message
		wantRecordCalled bool
		wantMessageCount int
	}{
		{
			name:             "records output for non-empty messages",
			messages:         []Message{NewAssistantMessage("test")},
			wantRecordCalled: true,
			wantMessageCount: 1,
		},
		{
			name:             "skips recording for empty messages",
			messages:         []Message{},
			wantRecordCalled: false,
		},
		{
			name:             "records multiple messages",
			messages:         []Message{NewUserMessage("q"), NewAssistantMessage("a")},
			wantRecordCalled: true,
			wantMessageCount: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockTelemetry := &mockTeamRecorder{}
			team := &Team{
				telemetryRecorder: mockTelemetry,
			}

			tel := turnTelemetry{
				span: &mockTelemetrySpan{},
			}

			team.recordTurnOutput(tel, tt.messages)

			assert.Equal(t, tt.wantRecordCalled, mockTelemetry.recordOutputCalled)
			if tt.wantRecordCalled {
				assert.Equal(t, tt.wantMessageCount, mockTelemetry.lastOutputMessageCount)
			}
		})
	}
}

func TestCompleteTurnOnError(t *testing.T) {
	tests := []struct {
		name          string
		err           error
		wantTerminate bool
		wantReturnErr bool
	}{
		{
			name:          "TerminateTeam error triggers termination",
			err:           &TerminateTeam{},
			wantTerminate: true,
			wantReturnErr: false,
		},
		{
			name:          "regular error returns error",
			err:           errors.New("execution failed"),
			wantTerminate: false,
			wantReturnErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockTelemetry := &mockTeamRecorder{}
			mockEventing := &mockEventingRecorder{}
			mockSpan := &mockTelemetrySpan{}

			team := &Team{
				telemetryRecorder: mockTelemetry,
				eventingRecorder:  mockEventing,
			}

			ctx := context.Background()
			tel := turnTelemetry{
				span: mockSpan,
			}

			shouldTerminate, returnErr := team.completeTurnOnError(ctx, tel, tt.err)

			assert.Equal(t, tt.wantTerminate, shouldTerminate)
			if tt.wantReturnErr {
				assert.Error(t, returnErr)
			} else {
				assert.NoError(t, returnErr)
			}
			assert.True(t, mockTelemetry.recordErrorCalled)
			assert.True(t, mockSpan.ended)
			assert.True(t, mockEventing.failCalled)
			assert.False(t, mockTelemetry.recordSuccessCalled)
			assert.False(t, mockEventing.completeCalled)
		})
	}
}

func TestCompleteTurnOnSuccess(t *testing.T) {
	mockTelemetry := &mockTeamRecorder{}
	mockEventing := &mockEventingRecorder{}
	mockSpan := &mockTelemetrySpan{}

	team := &Team{
		telemetryRecorder: mockTelemetry,
		eventingRecorder:  mockEventing,
	}

	ctx := context.Background()
	tel := turnTelemetry{
		span:    mockSpan,
		turnNum: 3,
	}

	team.completeTurnOnSuccess(ctx, tel)

	assert.True(t, mockTelemetry.recordSuccessCalled)
	assert.True(t, mockSpan.ended)
	assert.True(t, mockEventing.completeCalled)
	assert.False(t, mockTelemetry.recordErrorCalled)
	assert.False(t, mockEventing.failCalled)
}

func TestSelectMember_WithInvalidAgent(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "agent1"},
		&mockTeamMember{name: "agent2"},
	}

	mockSelector := &mockSelectorAgent{returnName: "selected"}
	team := &Team{
		Members:           members,
		mockSelectorAgent: mockSelector,
	}

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test")
	require.NoError(t, err)

	member, err := team.selectMember(ctx, []Message{}, tmpl, "agent1, agent2", "roles", nil)

	var invalidErr *InvalidAgentError
	require.ErrorAs(t, err, &invalidErr)
	assert.Equal(t, "selected", invalidErr.SelectedName)
	assert.Nil(t, member)
}

func TestSelectMember_ReturnsErrorOnNoMessages(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "agent1"},
	}

	mockSelector := &mockSelectorAgent{returnEmpty: true}
	team := &Team{
		Members:           members,
		mockSelectorAgent: mockSelector,
	}

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test")
	require.NoError(t, err)

	_, err = team.selectMember(ctx, []Message{}, tmpl, "agent1", "roles", nil)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "selector agent returned no messages")
}

func TestLoadSelectorAgent_WithMock(t *testing.T) {
	mockSelector := newMockSelectorAgent()
	team := &Team{
		mockSelectorAgent: mockSelector,
	}

	ctx := context.Background()
	agent, err := team.loadSelectorAgent(ctx)

	require.NoError(t, err)
	assert.NotNil(t, agent)
	assert.Equal(t, mockSelector, agent)
}

func TestLoadSelectorAgent_RequiresSelectorSpec(t *testing.T) {
	team := &Team{
		Selector: nil,
	}

	ctx := context.Background()
	_, err := team.loadSelectorAgent(ctx)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "selector agent must be specified")
}

func TestExecuteSelector_WithInvalidAgentSelection(t *testing.T) {
	mockMember1 := &mockTeamMember{name: "agent1"}
	mockMember2 := &mockTeamMember{name: "agent2"}

	mockSelector := &mockSelectorAgent{returnName: "invalid-agent"}
	maxTurns := 1

	team := &Team{
		Name:     "test-team",
		Strategy: "selector",
		Members: []TeamMember{
			mockMember1,
			mockMember2,
		},
		mockSelectorAgent: mockSelector,
		MaxTurns:          &maxTurns,
		telemetryRecorder: &mockTeamRecorder{},
		eventingRecorder:  &mockEventingRecorder{},
	}

	ctx := context.Background()
	userInput := NewUserMessage("test message")
	history := []Message{}

	messages, err := team.executeSelector(ctx, userInput, history)

	require.NoError(t, err)
	require.NotEmpty(t, messages)

	foundWarning := false
	for _, msg := range messages {
		if msg.OfSystem != nil {
			content := msg.OfSystem.Content.OfString.Value
			if content == "Selector returned invalid agent name: invalid-agent" {
				foundWarning = true
				break
			}
		}
	}

	assert.True(t, foundWarning, "Expected to find invalid agent warning message in output")
}
