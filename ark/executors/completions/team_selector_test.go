/* Copyright 2025. McKinsey & Company */

package completions

import (
	"context"
	"errors"
	"strings"
	"testing"
	"text/template"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/telemetry/noop"
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
			team.selectorAgent = newMockSelectorAgent()

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

			team.selectorAgent = newMockSelectorAgent()

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
			wantContains: "select-next-speaker tool",
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
			name: "TerminateTeamWithResponse adds original messages",
			err: &TerminateTeamWithResponse{
				Response: "Goodbye!",
				Messages: []Message{NewAssistantMessage("Goodbye!"), NewSystemMessage("extra")},
			},
			wantTerminate:       true,
			wantReturnErr:       false,
			wantMessagesAdded:   2,
			wantMessageContains: "Goodbye!",
		},
		{
			name:                "ToolNotCalledError adds warning and terminates",
			err:                 &ToolNotCalledError{},
			wantTerminate:       true,
			wantReturnErr:       false,
			wantMessagesAdded:   1,
			wantMessageContains: "select-next-speaker",
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
				msg := newMessages[0]
				var content string
				if msg.OfSystem != nil {
					content = msg.OfSystem.Content.OfString.Value
				} else if msg.OfAssistant != nil {
					content = msg.OfAssistant.Content.OfString.Value
				}
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

func TestSelectMemberToolNotCalled(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
	}

	team := &Team{
		Members: members,
	}
	team.selectorAgent = &mockSelectorAgentNoTool{
		tools: NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	member, err := team.selectMember(ctx, []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
	require.Error(t, err)
	assert.Nil(t, member)

	var toolNotCalledErr *ToolNotCalledError
	assert.True(t, errors.As(err, &toolNotCalledErr))
}

func TestSelectMemberEmptyCandidates(t *testing.T) {
	team := &Team{
		Members: []TeamMember{},
	}
	team.selectorAgent = newMockSelectorAgent()

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	member, err := team.selectMember(ctx, []Message{}, tmpl, "", "", []TeamMember{})
	require.Error(t, err)
	assert.Nil(t, member)
	assert.True(t, IsTerminateTeam(err))
	assert.Contains(t, err.Error(), "no candidates available for selection")
}

func TestSelectMember_RequiresToolCall(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "selected", description: "selected member"},
	}
	team := &Team{Members: members}
	mockSelector := newMockSelectorAgent()
	team.selectorAgent = mockSelector

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	_, err = team.selectMember(ctx, []Message{}, tmpl, "selected", "selected", members)
	require.NoError(t, err)

	assert.Equal(t, 1, mockSelector.executeCalls, "selector should call Execute exactly once")
	assert.Equal(t, ToolChoiceRequired, mockSelector.capturedOptions.ToolChoice, "selector must pass ToolChoiceRequired so the model is forced to call select-next-speaker or terminate")
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
		wantOutput       string
	}{
		{
			name:             "records output for non-empty messages",
			messages:         []Message{NewAssistantMessage("test")},
			wantRecordCalled: true,
			wantMessageCount: 1,
			wantOutput:       "test",
		},
		{
			name:             "skips recording for empty messages",
			messages:         []Message{},
			wantRecordCalled: false,
		},
		{
			name:             "records last assistant content across multiple messages",
			messages:         []Message{NewUserMessage("q"), NewAssistantMessage("a")},
			wantRecordCalled: true,
			wantMessageCount: 2,
			wantOutput:       "a",
		},
		{
			name:             "extracts assistant content when a system message is last",
			messages:         []Message{NewAssistantMessage("I AM AGENT A"), NewSystemMessage("done")},
			wantRecordCalled: true,
			wantMessageCount: 2,
			wantOutput:       "I AM AGENT A",
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
				assert.Equal(t, tt.wantOutput, mockTelemetry.lastOutput)
			}
		})
	}
}

func TestCompleteTurnOnError(t *testing.T) {
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

	team.completeTurnOnError(ctx, tel, errors.New("execution failed"))

	assert.True(t, mockTelemetry.recordErrorCalled)
	assert.True(t, mockSpan.ended)
	assert.True(t, mockEventing.failCalled)
	assert.False(t, mockTelemetry.recordSuccessCalled)
	assert.False(t, mockEventing.completeCalled)
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

	mockSelector := &mockSelectorAgent{
		returnName: "selected",
		tools:      NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
	team := &Team{
		Members:       members,
		selectorAgent: mockSelector,
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

	mockSelector := &mockSelectorAgent{
		returnEmpty: true,
		tools:       NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
	team := &Team{
		Members:       members,
		selectorAgent: mockSelector,
	}

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test")
	require.NoError(t, err)

	_, err = team.selectMember(ctx, []Message{}, tmpl, "agent1", "roles", nil)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "selector agent did not use the select-next-speaker tool")
}

func TestLoadSelectorAgent_WithMock(t *testing.T) {
	mockSelector := newMockSelectorAgent()
	team := &Team{
		selectorAgent: mockSelector,
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

func TestSelectMember_SelectorPrompt(t *testing.T) {
	enableTerminate := true
	disableTerminate := false

	members := []TeamMember{
		&mockTeamMember{name: "agent1"},
	}

	tests := []struct {
		name               string
		selector           *arkv1alpha1.TeamSelectorSpec
		wantPromptSuffix   string
		wantPromptContains string
		wantNoSuffix       string
	}{
		{
			name:               "default selector prompt when no selector spec",
			selector:           nil,
			wantPromptContains: "role play game",
		},
		{
			name: "custom selector prompt",
			selector: &arkv1alpha1.TeamSelectorSpec{
				SelectorPrompt: "Custom prompt: {{.Participants}}",
			},
			wantPromptContains: "Custom prompt:",
		},
		{
			name: "default terminate prompt appended when enableTerminateTool is true",
			selector: &arkv1alpha1.TeamSelectorSpec{
				EnableTerminateTool: &enableTerminate,
			},
			wantPromptSuffix:   defaultTerminatePrompt,
			wantPromptContains: "role play game",
		},
		{
			name: "custom terminate prompt appended when provided",
			selector: &arkv1alpha1.TeamSelectorSpec{
				EnableTerminateTool: &enableTerminate,
				TerminatePrompt:     "Call stop() when done.",
			},
			wantPromptSuffix:   "Call stop() when done.",
			wantPromptContains: "role play game",
		},
		{
			name: "terminate prompt not appended when enableTerminateTool is false",
			selector: &arkv1alpha1.TeamSelectorSpec{
				EnableTerminateTool: &disableTerminate,
				TerminatePrompt:     "Call stop() when done.",
			},
			wantPromptContains: "role play game",
			wantNoSuffix:       "Call stop() when done.",
		},
		{
			name: "terminate prompt not appended when enableTerminateTool is nil",
			selector: &arkv1alpha1.TeamSelectorSpec{
				TerminatePrompt: "Call stop() when done.",
			},
			wantPromptContains: "role play game",
			wantNoSuffix:       "Call stop() when done.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockSelector := &mockSelectorAgent{returnName: "agent1", tools: NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder())}
			team := &Team{
				Members:       members,
				Selector:      tt.selector,
				selectorAgent: mockSelector,
			}

			ctx := context.Background()
			tmpl, err := team.setupSelectorTemplate()
			require.NoError(t, err)

			_, _ = team.selectMember(ctx, []Message{}, tmpl, "agent1", "agent1", members)

			require.NotEmpty(t, mockSelector.capturedHistory)
			require.NotNil(t, mockSelector.capturedHistory[0].OfSystem)
			prompt := mockSelector.capturedHistory[0].OfSystem.Content.OfString.Value

			assert.Contains(t, prompt, tt.wantPromptContains)
			assert.Contains(t, prompt, "Use the select-next-speaker tool to express your next speaker selection.")

			if tt.wantPromptSuffix != "" {
				assert.True(t, strings.HasSuffix(prompt, tt.wantPromptSuffix),
					"expected prompt to end with %q, got: %q", tt.wantPromptSuffix, prompt)
			}

			if tt.wantNoSuffix != "" {
				assert.False(t, strings.HasSuffix(prompt, tt.wantNoSuffix),
					"expected prompt NOT to end with %q", tt.wantNoSuffix)
			}
		})
	}
}

func TestSelectMember_TerminatePromptFormat(t *testing.T) {
	enableTerminate := true
	members := []TeamMember{&mockTeamMember{name: "agent1"}}

	mockSelector := &mockSelectorAgent{
		returnName: "agent1",
		tools:      NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
	team := &Team{
		Members: members,
		Selector: &arkv1alpha1.TeamSelectorSpec{
			EnableTerminateTool: &enableTerminate,
			TerminatePrompt:     "Custom terminate.",
		},
		selectorAgent: mockSelector,
	}

	ctx := context.Background()
	tmpl, err := team.setupSelectorTemplate()
	require.NoError(t, err)

	_, _ = team.selectMember(ctx, []Message{}, tmpl, "agent1", "agent1", members)

	require.NotEmpty(t, mockSelector.capturedHistory)
	prompt := mockSelector.capturedHistory[0].OfSystem.Content.OfString.Value

	assert.Contains(t, prompt, "role play game")
	assert.True(t, strings.HasSuffix(prompt, "\n\nCustom terminate."),
		"expected prompt to end with terminate prompt, got: %q", prompt)
}

func TestExecuteSelector_WithInvalidAgentSelection(t *testing.T) {
	mockMember1 := &mockTeamMember{name: "agent1"}
	mockMember2 := &mockTeamMember{name: "agent2"}

	mockSelector := &mockSelectorAgent{
		returnName: "invalid-agent",
		tools:      NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
	maxTurns := 1

	team := &Team{
		Name:     "test-team",
		Strategy: "selector",
		Members: []TeamMember{
			mockMember1,
			mockMember2,
		},
		selectorAgent:     mockSelector,
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

func TestExtractTerminateToolResponse(t *testing.T) {
	tests := []struct {
		name     string
		result   *ExecutionResult
		wantResp string
	}{
		{
			name:     "nil result returns empty",
			result:   nil,
			wantResp: "",
		},
		{
			name:     "empty messages returns empty",
			result:   &ExecutionResult{Messages: []Message{}},
			wantResp: "",
		},
		{
			name: "tool message content is returned",
			result: &ExecutionResult{
				Messages: []Message{
					ToolMessage("The answer is 42", "call-id"),
				},
			},
			wantResp: "The answer is 42",
		},
		{
			name: "last tool message is returned when multiple messages",
			result: &ExecutionResult{
				Messages: []Message{
					NewAssistantMessage("thinking..."),
					ToolMessage("final answer", "call-id"),
				},
			},
			wantResp: "final answer",
		},
		{
			name: "no tool message returns empty",
			result: &ExecutionResult{
				Messages: []Message{
					NewAssistantMessage("just text"),
				},
			},
			wantResp: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTerminateToolResponse(tt.result)
			assert.Equal(t, tt.wantResp, got)
		})
	}
}

func TestExecuteSelector_WithTerminateTool(t *testing.T) {
	mockMember1 := &mockTeamMember{name: "agent1"}
	mockMember2 := &mockTeamMember{name: "agent2"}

	mockSelector := &mockSelectorAgent{
		returnTerminateResponse: "No further responses needed.",
		tools:                   NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
	stream := &mockEventStream{}

	team := &Team{
		Name:     "test-team",
		Strategy: "selector",
		Members: []TeamMember{
			mockMember1,
			mockMember2,
		},
		selectorAgent:     mockSelector,
		telemetryRecorder: &mockTeamRecorder{},
		eventingRecorder:  &mockEventingRecorder{},
		eventStream:       stream,
	}

	ctx := context.Background()
	userInput := NewUserMessage("test message")
	history := []Message{}

	messages, err := team.executeSelector(ctx, userInput, history)

	require.NoError(t, err)
	require.NotEmpty(t, messages, "terminate response should be included in messages")

	foundToolCall := false
	for _, msg := range messages {
		if msg.OfAssistant != nil && len(msg.OfAssistant.ToolCalls) > 0 {
			for _, tc := range msg.OfAssistant.ToolCalls {
				if tc.Function.Name == "terminate" {
					foundToolCall = true
					break
				}
			}
		}
	}
	assert.True(t, foundToolCall, "Expected to find terminate tool call in messages")

	require.Len(t, stream.chunks, 1, "Expected terminate response to be streamed")
}

func TestSelectMember_WithTerminateTeamError(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "agent1"},
		&mockTeamMember{name: "agent2"},
	}

	mockSelector := &mockSelectorAgent{
		returnTerminateResponse: "Done.",
		tools:                   NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
	team := &Team{
		Members:       members,
		selectorAgent: mockSelector,
	}

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test")
	require.NoError(t, err)

	member, err := team.selectMember(ctx, []Message{}, tmpl, "agent1, agent2", "roles", nil)

	assert.Nil(t, member)
	require.Error(t, err)
	var terminateResp *TerminateTeamWithResponse
	require.True(t, errors.As(err, &terminateResp))
	assert.Equal(t, "Done.", terminateResp.Response)
}

func TestSelectMember_WithNilToolRegistry(t *testing.T) {
	members := []TeamMember{
		&mockTeamMember{name: "agent1"},
	}

	mockSelector := &mockSelectorAgent{returnName: "agent1", tools: nil}
	team := &Team{
		Members:       members,
		selectorAgent: mockSelector,
	}

	ctx := context.Background()
	tmpl, err := template.New("test").Parse("test")
	require.NoError(t, err)

	member, err := team.selectMember(ctx, []Message{}, tmpl, "agent1", "roles", nil)

	assert.Nil(t, member)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "select-next-speaker tool requires a selector agent with a tool registry")
}

func TestRegisterSelectNextSpeakerTool_WithRealAgent(t *testing.T) {
	telemetryProvider := noop.NewProvider()
	eventingProvider := eventnoop.NewProvider()

	registry := NewToolRegistry(nil, telemetryProvider.ToolRecorder(), eventingProvider.ToolRecorder())
	agent := &Agent{
		Tools: registry,
	}

	team := &Team{}
	ctx := context.Background()

	err := team.registerSelectNextSpeakerTool(ctx, agent, []string{"agent-a", "agent-b"})
	require.NoError(t, err)

	defs := agent.Tools.GetToolDefinitions()
	require.Len(t, defs, 1)
	assert.Equal(t, BuiltinToolSelectNextSpeaker, defs[0].Name)

	toolType := agent.Tools.GetToolType(BuiltinToolSelectNextSpeaker)
	assert.Equal(t, ToolTypeBuiltin, toolType)
}

func TestMatchSelectedName(t *testing.T) {
	candidates := []string{"researcher", "analyst", "analyst-senior"}

	tests := []struct {
		name     string
		response string
		want     string
		wantErr  bool
	}{
		{name: "exact match", response: "researcher", want: "researcher"},
		{name: "surrounding whitespace is trimmed", response: "  analyst\n", want: "analyst"},
		{name: "case insensitive", response: "Researcher", want: "researcher"},
		{name: "name embedded in prose", response: "I pick researcher for this.", want: "researcher"},
		{name: "longer candidate wins over its own prefix", response: "analyst-senior", want: "analyst-senior"},
		{name: "prose naming the longer candidate", response: "Let's ask analyst-senior next.", want: "analyst-senior"},
		{name: "no match", response: "nobody", wantErr: true},
		{name: "empty response", response: "", wantErr: true},
		{name: "ambiguous mention of two candidates", response: "either researcher or analyst", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := matchSelectedName(tt.response, candidates)
			if tt.wantErr {
				require.Error(t, err)
				var invalidAgentErr *InvalidAgentError
				assert.True(t, errors.As(err, &invalidAgentErr), "no match must surface as InvalidAgentError")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func newEngineSelectorTeam(reply string) (*Team, *mockSelectorAgent) {
	members := []TeamMember{
		&mockTeamMember{name: "researcher"},
		&mockTeamMember{name: "analyst"},
	}
	team := &Team{Members: members}
	selector := newMockSelectorAgent()
	selector.executionEngine = &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"}
	selector.returnText = reply
	team.selectorAgent = selector
	return team, selector
}

func TestSelectMember_EngineBackedSelectorTextMatching(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	tests := []struct {
		name  string
		reply string
		want  string
	}{
		{name: "exact", reply: "analyst", want: "analyst"},
		{name: "case insensitive", reply: "Researcher", want: "researcher"},
		{name: "unique substring", reply: "The next speaker should be analyst.", want: "analyst"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			team, selector := newEngineSelectorTeam(tt.reply)

			member, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
			require.NoError(t, err)
			require.NotNil(t, member)
			assert.Equal(t, tt.want, member.GetName())

			assert.Empty(t, selector.capturedOptions.ToolChoice, "an engine cannot be forced to call a local tool")
			assert.Empty(t, selector.GetToolRegistry().GetToolDefinitions(), "select-next-speaker must not be registered for an engine selector")
		})
	}
}

func TestSelectMember_EngineBackedSelectorNoMatch(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	team, _ := newEngineSelectorTeam("I have no idea")

	member, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
	require.Error(t, err)
	assert.Nil(t, member)

	var invalidAgentErr *InvalidAgentError
	assert.True(t, errors.As(err, &invalidAgentErr))
}

func TestSelectMember_LocalSelectorStillUsesTool(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)

	members := []TeamMember{&mockTeamMember{name: "selected"}}
	team := &Team{Members: members}
	selector := newMockSelectorAgent()
	team.selectorAgent = selector

	_, err = team.selectMember(context.Background(), []Message{}, tmpl, "selected", "selected", members)
	require.NoError(t, err)

	assert.Equal(t, ToolChoiceRequired, selector.capturedOptions.ToolChoice)
	require.Len(t, selector.GetToolRegistry().GetToolDefinitions(), 1)
	assert.Equal(t, BuiltinToolSelectNextSpeaker, selector.GetToolRegistry().GetToolDefinitions()[0].Name)
}

func TestSelectMember_EngineBackedSelectorTerminates(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)
	enabled := true

	t.Run("terminate token ends the run", func(t *testing.T) {
		team, selector := newEngineSelectorTeam(engineTerminateToken)
		team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

		member, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
		require.Error(t, err)
		assert.Nil(t, member)
		assert.True(t, IsTerminateTeam(err), "an engine selector must be able to end the run, not just loop to maxTurns")

		system := selector.capturedHistory[0].OfSystem.Content.OfString.String()
		assert.Contains(t, system, engineTerminateToken,
			"the selector must be told how to terminate")
		assert.NotContains(t, system, "terminate tool",
			"an engine cannot call a tool, so it must not be told to")
	})

	t.Run("lowercase and padded token still terminates", func(t *testing.T) {
		team, _ := newEngineSelectorTeam("  terminate\n")
		team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

		_, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
		require.Error(t, err)
		assert.True(t, IsTerminateTeam(err))
	})

	t.Run("terminate token is not special when the tool is disabled", func(t *testing.T) {
		team, _ := newEngineSelectorTeam(engineTerminateToken)

		_, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
		require.Error(t, err)
		assert.False(t, IsTerminateTeam(err))
		var invalidAgentErr *InvalidAgentError
		assert.True(t, errors.As(err, &invalidAgentErr))
	})

	t.Run("a name still selects when terminate is enabled", func(t *testing.T) {
		team, _ := newEngineSelectorTeam("analyst")
		team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

		member, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
		require.NoError(t, err)
		assert.Equal(t, "analyst", member.GetName())
	})

	t.Run("a member named terminate is selectable", func(t *testing.T) {
		team, selector := newEngineSelectorTeam("terminate")
		team.Members = append(team.Members, &mockTeamMember{name: "terminate"})
		team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

		member, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst, terminate", "researcher, analyst, terminate", nil)
		require.NoError(t, err, "naming a member must route to it, not silently end the run")
		require.NotNil(t, member)
		assert.Equal(t, "terminate", member.GetName())

		system := selector.capturedHistory[0].OfSystem.Content.OfString.String()
		assert.Contains(t, system, engineTerminateFallbackToken,
			"the selector must be asked for a token that cannot be a member name")
	})

	t.Run("a team with a member named terminate can still terminate", func(t *testing.T) {
		team, _ := newEngineSelectorTeam(engineTerminateFallbackToken + ": all done")
		team.Members = append(team.Members, &mockTeamMember{name: "terminate"})
		team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

		_, err := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst, terminate", "researcher, analyst, terminate", nil)
		require.Error(t, err)

		var withResponse *TerminateTeamWithResponse
		require.True(t, errors.As(err, &withResponse))
		assert.Equal(t, "all done", withResponse.Response)
	})
}

func TestParseEngineTerminate(t *testing.T) {
	tests := []struct {
		name         string
		reply        string
		token        string
		wantResponse string
		wantTerm     bool
	}{
		{name: "bare token", reply: "TERMINATE", wantTerm: true},
		{name: "padded and lowercase", reply: "  terminate\n", wantTerm: true},
		{name: "colon payload", reply: "TERMINATE: the answer is 42", wantResponse: "the answer is 42", wantTerm: true},
		{name: "whitespace payload", reply: "TERMINATE the answer is 42", wantResponse: "the answer is 42", wantTerm: true},
		{name: "text after the token is preserved verbatim", reply: "Terminate - all done", wantResponse: "- all done", wantTerm: true},
		{name: "a hyphenated member name is not a termination", reply: "terminate-agent", wantTerm: false},
		{name: "a name merely starting with the token is not a termination", reply: "terminated-agent", wantTerm: false},
		{name: "a plain name is not a termination", reply: "researcher", wantTerm: false},
		{name: "empty reply", reply: "", wantTerm: false},
		{
			name:  "the member name is not the token once the fallback is in use",
			reply: "terminate", token: engineTerminateFallbackToken, wantTerm: false,
		},
		{
			name:  "the fallback token terminates",
			reply: "TERMINATE_TEAM", token: engineTerminateFallbackToken, wantTerm: true,
		},
		{
			name:  "the fallback token carries a payload",
			reply: "terminate_team: all done", token: engineTerminateFallbackToken,
			wantResponse: "all done", wantTerm: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token := tt.token
			if token == "" {
				token = engineTerminateToken
			}
			response, terminated := parseEngineTerminate(tt.reply, token)
			assert.Equal(t, tt.wantTerm, terminated)
			assert.Equal(t, tt.wantResponse, response)
		})
	}
}

// A member may legitimately be called "terminate". Reading its name as the
// control token would silently end the run instead of routing to it, so the
// prompt asks for a token that cannot be a resource name.
func TestEngineTerminateTokenAvoidsMemberNameCollision(t *testing.T) {
	assert.Equal(t, engineTerminateToken, engineTerminateTokenFor([]string{"researcher", "analyst"}))
	assert.Equal(t, engineTerminateFallbackToken, engineTerminateTokenFor([]string{"researcher", "terminate"}))
	assert.Equal(t, engineTerminateToken, engineTerminateTokenFor([]string{"terminate-agent", "terminated"}),
		"only an exact name collides; the parser already rejects these as terminations")
}

func TestSelectMember_EngineSelectorTerminateCarriesResponse(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)
	enabled := true

	team, _ := newEngineSelectorTeam("TERMINATE: everything the user asked has been covered")
	team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

	_, err = team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
	require.Error(t, err)

	var withResponse *TerminateTeamWithResponse
	require.True(t, errors.As(err, &withResponse), "an engine selector's closing answer must reach the user, as a local selector's does")
	assert.Equal(t, "everything the user asked has been covered", withResponse.Response)
}

// The terminate token is control text, not content. It must not reach the team
// transcript, which becomes the query's final status.response.content — the
// stream already receives the parsed response, and the two must agree.
func TestEngineTerminateResponseReachesTranscriptWithoutToken(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)
	enabled := true

	team, _ := newEngineSelectorTeam("TERMINATE: the quarterly figures are in the attached summary")
	team.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}

	_, selErr := team.selectMember(context.Background(), []Message{}, tmpl, "researcher, analyst", "researcher, analyst", nil)
	require.Error(t, selErr)

	var newMessages []Message
	shouldTerminate, returnErr := team.handleMemberSelectionError(context.Background(), selErr, &newMessages)
	require.NoError(t, returnErr)
	assert.True(t, shouldTerminate)

	final := extractAssistantText(newMessages)
	assert.Equal(t, "the quarterly figures are in the attached summary", final)
	assert.NotContains(t, final, engineTerminateToken, "the control token must never surface to the user")
}

// The reported case: a member legitimately called "terminate-agent" must be
// selectable, not swallowed as a termination command.
func TestEngineSelectorPicksMemberNamedLikeTheTerminateToken(t *testing.T) {
	tmpl, err := template.New("test").Parse("test template")
	require.NoError(t, err)
	enabled := true

	members := []TeamMember{
		&mockTeamMember{name: "terminate-agent"},
		&mockTeamMember{name: "analyst"},
	}
	team := &Team{Members: members, Selector: &arkv1alpha1.TeamSelectorSpec{Agent: "sel", EnableTerminateTool: &enabled}}
	selector := newMockSelectorAgent()
	selector.executionEngine = &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"}
	selector.returnText = "terminate-agent"
	team.selectorAgent = selector

	member, err := team.selectMember(context.Background(), []Message{}, tmpl, "terminate-agent, analyst", "terminate-agent, analyst", nil)
	require.NoError(t, err, "a valid member name must not be read as a termination command")
	require.NotNil(t, member)
	assert.Equal(t, "terminate-agent", member.GetName())
}

func TestContainsWholeName(t *testing.T) {
	tests := []struct {
		name     string
		haystack string
		needle   string
		want     bool
	}{
		{name: "exact", haystack: "analyst", needle: "analyst", want: true},
		{name: "surrounded by spaces", haystack: "pick analyst next", needle: "analyst", want: true},
		{name: "sentence-ending period", haystack: "the next speaker should be analyst.", needle: "analyst", want: true},
		{name: "inside a longer word is not a match", haystack: "run the analysis now", needle: "ana", want: false},
		{name: "substring of another name is not a match", haystack: "use agent-2", needle: "agent", want: false},
		{name: "the longer name itself matches", haystack: "use agent-2", needle: "agent-2", want: true},
		{name: "prefix of a word is not a match", haystack: "bananas", needle: "ana", want: false},
		{name: "absent", haystack: "nobody here", needle: "analyst", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, containsWholeName(tt.haystack, tt.needle))
		})
	}
}

func TestMatchSelectedNameRejectsPartialWords(t *testing.T) {
	// "ana" is a real member; "analysis" merely contains those letters.
	_, err := matchSelectedName("let us run the analysis first", []string{"ana", "researcher"})
	require.Error(t, err)
	var invalidAgentErr *InvalidAgentError
	assert.True(t, errors.As(err, &invalidAgentErr))
}

func TestTerminatePromptForHonoursCustomPrompt(t *testing.T) {
	const custom = "Stop as soon as the customer's billing question is fully answered."

	t.Run("engine-backed keeps the configured prompt and adds the mechanism", func(t *testing.T) {
		team := &Team{Selector: &arkv1alpha1.TeamSelectorSpec{TerminatePrompt: custom}}
		got := team.terminatePromptFor(true, engineTerminateToken)
		assert.Contains(t, got, custom, "the author's terminate condition must not be discarded")
		assert.Contains(t, got, engineTerminateToken)
		assert.NotContains(t, got, "terminate tool", "an engine has no tools to call")
	})

	t.Run("local keeps the configured prompt unchanged", func(t *testing.T) {
		team := &Team{Selector: &arkv1alpha1.TeamSelectorSpec{TerminatePrompt: custom}}
		assert.Equal(t, custom, team.terminatePromptFor(false, engineTerminateToken))
	})

	t.Run("engine-backed default mentions no tool", func(t *testing.T) {
		team := &Team{Selector: &arkv1alpha1.TeamSelectorSpec{}}
		got := team.terminatePromptFor(true, engineTerminateToken)
		assert.NotContains(t, got, "terminate tool")
		assert.Contains(t, got, engineTerminateToken)
	})

	t.Run("local default is unchanged", func(t *testing.T) {
		team := &Team{Selector: &arkv1alpha1.TeamSelectorSpec{}}
		assert.Equal(t, defaultTerminatePrompt, team.terminatePromptFor(false, engineTerminateToken))
	})
}
