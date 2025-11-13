package genai

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"text/template"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const defaultSelectorPrompt = `You are in a role play game. The following roles are available:
{{.Roles}}.
Read the following conversation. Then select the next role from {{.Participants}} to play. Only return the role.

{{.History}}

Read the above conversation. Then select the next role from {{.Participants}} to play. Only return the role.`

type SelectorTemplateData struct {
	Roles        string
	Participants string
	History      string
}

func buildHistory(messages []Message) string {
	var history []string
	for _, msg := range messages {
		if m := msg.OfAssistant; m != nil {
			history = append(history, fmt.Sprintf("# %s:\n%s\n", m.Name.Value, m.Content.OfString))
		}
		if m := msg.OfUser; m != nil {
			history = append(history, fmt.Sprintf("# user:\n%s\n", m.Content.OfString))
		}
	}
	return strings.Join(history, "\n")
}

func buildParticipants(members []TeamMember) string {
	participants := make([]string, 0, len(members))
	for _, member := range members {
		participants = append(participants, member.GetName())
	}
	return strings.Join(participants, ", ")
}

func buildRoles(members []TeamMember) string {
	var roles []string
	for _, member := range members {
		if desc := member.GetDescription(); desc != "" {
			roles = append(roles, member.GetName()+": "+desc)
		} else {
			roles = append(roles, member.GetName())
		}
	}
	return strings.Join(roles, ", ")
}

func (t *Team) loadSelectorAgent(ctx context.Context) (*Agent, error) {
	if t.Selector == nil || t.Selector.Agent == "" {
		return nil, fmt.Errorf("selector agent must be specified")
	}

	agentName := t.Selector.Agent

	var agentCRD arkv1alpha1.Agent
	key := types.NamespacedName{Name: agentName, Namespace: t.Namespace}
	if err := t.Client.Get(ctx, key, &agentCRD); err != nil {
		return nil, fmt.Errorf("failed to get selector agent %s in namespace %s: %w", agentName, t.Namespace, err)
	}

	agent, err := MakeAgent(ctx, t.Client, &agentCRD, t.Recorder, t.TelemetryProvider)
	if err != nil {
		return nil, fmt.Errorf("failed to create selector agent: %w", err)
	}

	return agent, nil
}

//nolint:gocognit // Complex function handling selector agent logic, but cohesive responsibilities
func (t *Team) selectMember(ctx context.Context, messages []Message, tmpl *template.Template, participantsList, rolesList, previousMember string, candidateMembers []TeamMember) (TeamMember, error) {
	history := buildHistory(messages)
	data := SelectorTemplateData{
		Roles:        rolesList,
		Participants: participantsList,
		History:      history,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, err
	}

	selectorAgent, err := t.loadSelectorAgent(ctx)
	if err != nil {
		return nil, err
	}

	response, err := selectorAgent.Execute(ctx, NewUserMessage("Select the next participant to respond."), []Message{NewSystemMessage(buf.String())}, nil, nil)
	if err != nil {
		if IsTerminateTeam(err) {
			return nil, err
		}
		return nil, fmt.Errorf("selector agent call failed: %w", err)
	}

	if len(response) == 0 {
		return nil, fmt.Errorf("selector agent returned no messages")
	}

	var selectedName string
	lastMsg := response[len(response)-1]
	if lastMsg.OfAssistant != nil && lastMsg.OfAssistant.Content.OfString.Value != "" {
		selectedName = strings.TrimSpace(lastMsg.OfAssistant.Content.OfString.Value)
	} else {
		return nil, fmt.Errorf("selector agent returned invalid response")
	}

	rec := NewExecutionRecorder(t.Recorder)
	rec.SelectorAgentResponse(ctx, t.FullName(), selectorAgent.Name, selectedName, participantsList)

	// Use candidateMembers if provided, otherwise use all team members
	membersToSearch := t.Members
	if candidateMembers != nil {
		membersToSearch = candidateMembers
	}

	// Find selected member
	for _, member := range membersToSearch {
		if member.GetName() == selectedName {
			rec.ParticipantSelected(ctx, t.FullName(), selectedName, "exact_match")
			return member, nil
		}
	}

	// Fallback to first member if not found
	if len(membersToSearch) > 0 {
		fallback := membersToSearch[0]
		rec.ParticipantSelected(ctx, t.FullName(), fallback.GetName(), "fallback_no_match")

		// Avoid repeating same member
		if fallback.GetName() == previousMember && len(membersToSearch) > 1 {
			fallback = membersToSearch[1]
		}
		return fallback, nil
	}

	return nil, fmt.Errorf("no members available")
}

// determineNextMember routes to the appropriate selection logic based on whether graph constraints exist.
func (t *Team) determineNextMember(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	switch {
	case previousMember == "":
		// First turn: use first member
		return t.Members[0], nil
	case len(legalTransitions) == 0:
		// No graph constraints: use standard selector (all members available)
		participantsList := buildParticipants(t.Members)
		rolesList := buildRoles(t.Members)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, previousMember, nil)
	default:
		// Graph constraints provided: use legal transitions
		return t.selectFromGraphConstraints(ctx, messages, tmpl, previousMember, legalTransitions)
	}
}

// selectFromGraphConstraints selects a member from the graph-constrained legal transitions.
func (t *Team) selectFromGraphConstraints(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	// Build name-to-member lookup map once
	memberLookup := make(map[string]TeamMember, len(t.Members))
	for _, member := range t.Members {
		memberLookup[member.GetName()] = member
	}

	// Find previous member to get legal transitions
	previousMemberObj := memberLookup[previousMember]

	if previousMemberObj == nil {
		// Previous member not found, fallback to first member
		t.Recorder.EmitEvent(ctx, corev1.EventTypeWarning, "PreviousMemberNotFound", BaseEvent{
			Name: t.FullName(),
			Metadata: map[string]string{
				"strategy":       t.Strategy,
				"previousMember": previousMember,
				"teamName":       t.FullName(),
			},
		})
		return t.Members[0], nil
	}

	legal := legalTransitions[previousMember]

	switch len(legal) {
	case 0:
		// No legal transitions - fallback to first member
		t.Recorder.EmitEvent(ctx, corev1.EventTypeWarning, "NoLegalTransitions", BaseEvent{
			Name: t.FullName(),
			Metadata: map[string]string{
				"strategy":       t.Strategy,
				"previousMember": previousMember,
				"teamName":       t.FullName(),
			},
		})
		return t.Members[0], nil
	case 1:
		// Only one legal transition - use it directly (skip selector agent for optimization)
		selectedMember := legal[0]
		rec := NewExecutionRecorder(t.Recorder)
		rec.ParticipantSelected(ctx, t.FullName(), selectedMember.GetName(), "graph_constrained_single")
		return selectedMember, nil
	default:
		// Multiple legal transitions - use selector agent to choose from candidates
		participantsList := buildParticipants(legal)
		rolesList := buildRoles(legal)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, previousMember, legal)
	}
}

//nolint:gocognit // Complex function orchestrating selector logic with graph constraints, but cohesive responsibilities
func (t *Team) executeSelector(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	messages := append([]Message{}, history...)
	var newMessages []Message

	promptTemplate := defaultSelectorPrompt
	if t.Selector != nil && t.Selector.SelectorPrompt != "" {
		promptTemplate = t.Selector.SelectorPrompt
	}

	tmpl, err := template.New("selector").Parse(promptTemplate)
	if err != nil {
		return newMessages, err
	}

	// Build legal transitions map if graph constraints are provided
	// Map from member name to list of TeamMember objects (not strings)
	legalTransitions := make(map[string][]TeamMember)
	if t.Graph != nil {
		// Build member lookup map for converting names to TeamMember objects
		memberLookup := make(map[string]TeamMember)
		for _, member := range t.Members {
			memberLookup[member.GetName()] = member
		}

		for _, edge := range t.Graph.Edges {
			// Convert edge.To (string) to TeamMember object
			if member, exists := memberLookup[edge.To]; exists {
				legalTransitions[edge.From] = append(legalTransitions[edge.From], member)
			}
		}
	}

	previousMember := ""

	for turn := 0; ; turn++ {
		turnTracker := NewExecutionRecorder(t.Recorder)
		turnTracker.TeamTurn(ctx, "Start", t.FullName(), t.Strategy, turn)

		// Determine next member based on graph constraints (if any)
		nextMember, err := t.determineNextMember(ctx, messages, tmpl, previousMember, legalTransitions)
		if err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		// Start turn-level telemetry span
		turnCtx, turnSpan := t.TeamRecorder.StartTurn(ctx, turn, nextMember.GetName(), nextMember.GetType())
		defer turnSpan.End()

		err = t.executeMemberAndAccumulate(turnCtx, nextMember, userInput, &messages, &newMessages, turn)

		// Record turn output
		if len(newMessages) > 0 {
			t.TeamRecorder.RecordTurnOutput(turnSpan, newMessages, len(newMessages))
		}

		if err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			t.TeamRecorder.RecordError(turnSpan, err)
			return newMessages, err
		}

		t.TeamRecorder.RecordSuccess(turnSpan)

		previousMember = nextMember.GetName()

		if t.MaxTurns != nil && turn+1 >= *t.MaxTurns {
			turnTracker.TeamTurn(ctx, "MaxTurns", t.FullName(), t.Strategy, turn+1)
			// Log the maxTurns limit for observability, but return success with accumulated messages
			t.Recorder.EmitEvent(ctx, corev1.EventTypeWarning, "TeamMaxTurnsReached", BaseEvent{
				Name: t.FullName(),
				Metadata: map[string]string{
					"strategy": t.Strategy,
					"maxTurns": fmt.Sprintf("%d", *t.MaxTurns),
					"teamName": t.FullName(),
				},
			})
			return newMessages, nil
		}
	}
}
