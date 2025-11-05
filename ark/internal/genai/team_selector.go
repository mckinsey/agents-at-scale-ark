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

func (t *Team) selectMember(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string) (TeamMember, int, error) {
	// Build indices for all members
	indices := make([]int, len(t.Members))
	for i := range t.Members {
		indices[i] = i
	}

	return t.selectMemberWithConstraints(ctx, messages, tmpl, t.Members, indices, previousMember)
}

// selectMemberWithConstraints selects a member using the selector agent, working with a constrained list of members.
// This allows constraining the selector to only legal transitions when graph constraints are provided.
func (t *Team) selectMemberWithConstraints(ctx context.Context, messages []Message, tmpl *template.Template, candidateMembers []TeamMember, candidateIndices []int, previousMember string) (TeamMember, int, error) {
	if len(candidateMembers) == 0 {
		return nil, 0, fmt.Errorf("no candidate members available")
	}

	history := buildHistory(messages)
	participantsList := buildParticipants(candidateMembers)
	rolesList := buildRoles(candidateMembers)

	data := SelectorTemplateData{
		Roles:        rolesList,
		Participants: participantsList,
		History:      history,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, 0, err
	}

	selectorAgent, err := t.loadSelectorAgent(ctx)
	if err != nil {
		return nil, 0, err
	}

	response, err := selectorAgent.Execute(ctx, NewUserMessage("Select the next participant to respond."), []Message{NewSystemMessage(buf.String())}, nil, nil)
	if err != nil {
		if IsTerminateTeam(err) {
			return nil, 0, err
		}
		return nil, 0, fmt.Errorf("selector agent call failed: %w", err)
	}

	if len(response) == 0 {
		return nil, 0, fmt.Errorf("selector agent returned no messages")
	}

	var selectedName string
	lastMsg := response[len(response)-1]
	if lastMsg.OfAssistant != nil && lastMsg.OfAssistant.Content.OfString.Value != "" {
		selectedName = strings.TrimSpace(lastMsg.OfAssistant.Content.OfString.Value)
	} else {
		return nil, 0, fmt.Errorf("selector agent returned invalid response")
	}

	rec := NewExecutionRecorder(t.Recorder)
	rec.SelectorAgentResponse(ctx, t.FullName(), selectorAgent.Name, selectedName, participantsList)

	// Find selected member in candidate list
	for i, member := range candidateMembers {
		if member.GetName() == selectedName {
			rec.ParticipantSelected(ctx, t.FullName(), selectedName, "exact_match")
			return member, candidateIndices[i], nil
		}
	}

	// Fallback to first candidate member if not found
	fallback := candidateMembers[0]
	rec.ParticipantSelected(ctx, t.FullName(), fallback.GetName(), "fallback_no_match")

	// Avoid repeating same member
	if fallback.GetName() == previousMember && len(candidateMembers) > 1 {
		fallback = candidateMembers[1]
		return fallback, candidateIndices[1], nil
	}

	return fallback, candidateIndices[0], nil
}

// selectNextMember determines the next team member based on graph constraints and previous member.
func (t *Team) selectNextMember(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]string, memberMap map[string]TeamMember, memberIndexMap map[string]int) (TeamMember, int, error) {
	switch {
	case previousMember == "":
		// First turn: use first member
		return t.Members[0], 0, nil
	case len(legalTransitions) == 0:
		// No graph constraints: use standard selector (all members available)
		return t.selectMember(ctx, messages, tmpl, previousMember)
	default:
		// Graph constraints provided: use legal transitions
		return t.selectNextMemberWithGraphConstraints(ctx, messages, tmpl, previousMember, legalTransitions, memberMap, memberIndexMap)
	}
}

func (t *Team) selectNextMemberWithGraphConstraints(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]string, memberMap map[string]TeamMember, memberIndexMap map[string]int) (TeamMember, int, error) {
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
		return t.Members[0], 0, nil
	case 1:
		// Only one legal transition - use it directly (skip selector agent for optimization)
		selectedName := legal[0]
		member, exists := memberMap[selectedName]
		if !exists {
			return nil, 0, fmt.Errorf("legal transition target '%s' not found in team members", selectedName)
		}

		rec := NewExecutionRecorder(t.Recorder)
		rec.ParticipantSelected(ctx, t.FullName(), selectedName, "graph_constrained_single")
		return member, memberIndexMap[selectedName], nil
	default:
		// Multiple legal transitions - filter members and use selector agent
		candidateMembers := make([]TeamMember, 0, len(legal))
		candidateIndices := make([]int, 0, len(legal))
		for _, legalName := range legal {
			if member, exists := memberMap[legalName]; exists {
				candidateMembers = append(candidateMembers, member)
				candidateIndices = append(candidateIndices, memberIndexMap[legalName])
			}
		}

		if len(candidateMembers) == 0 {
			return nil, 0, fmt.Errorf("no valid members found for legal transitions from '%s'", previousMember)
		}

		return t.selectMemberWithConstraints(ctx, messages, tmpl, candidateMembers, candidateIndices, previousMember)
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
	legalTransitions := make(map[string][]string)
	if t.Graph != nil {
		for _, edge := range t.Graph.Edges {
			legalTransitions[edge.From] = append(legalTransitions[edge.From], edge.To)
		}
	}

	// Build member map for quick lookup
	memberMap := make(map[string]TeamMember)
	memberIndexMap := make(map[string]int)
	for i, member := range t.Members {
		memberMap[member.GetName()] = member
		memberIndexMap[member.GetName()] = i
	}

	previousMember := ""

	for turn := 0; ; turn++ {
		turnTracker := NewExecutionRecorder(t.Recorder)
		turnTracker.TeamTurn(ctx, "Start", t.FullName(), t.Strategy, turn)

		// Determine next member based on graph constraints (if any)
		nextMember, memberIndex, err := t.selectNextMember(ctx, messages, tmpl, previousMember, legalTransitions, memberMap, memberIndexMap)
		if err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		// Start turn-level telemetry span
		turnCtx, turnSpan := t.TeamRecorder.StartTurn(ctx, turn, nextMember.GetName(), nextMember.GetType())
		defer turnSpan.End()

		err = t.executeMemberAndAccumulate(turnCtx, nextMember, userInput, &messages, &newMessages, memberIndex)

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
