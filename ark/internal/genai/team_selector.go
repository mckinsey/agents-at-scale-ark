package genai

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"text/template"

	"k8s.io/apimachinery/pkg/types"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
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

type InvalidAgentError struct {
	SelectedName string
}

func (e *InvalidAgentError) Error() string {
	return fmt.Sprintf("selector did not choose valid agent: returned %s", e.SelectedName)
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

func (t *Team) loadSelectorAgent(ctx context.Context) (SelectorAgentInterface, error) {
	// Check for override selector agent first (used in tests)
	if t.mockSelectorAgent != nil {
		return t.mockSelectorAgent, nil
	}

	if t.Selector == nil || t.Selector.Agent == "" {
		return nil, fmt.Errorf("selector agent must be specified")
	}

	agentName := t.Selector.Agent

	var agentCRD arkv1alpha1.Agent
	key := types.NamespacedName{Name: agentName, Namespace: t.Namespace}
	if err := t.Client.Get(ctx, key, &agentCRD); err != nil {
		return nil, fmt.Errorf("failed to get selector agent %s in namespace %s: %w", agentName, t.Namespace, err)
	}

	agent, err := MakeAgent(ctx, t.Client, &agentCRD, t.telemetry, t.eventing)
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

	result, err := selectorAgent.Execute(ctx, NewUserMessage("Select the next participant to respond."), []Message{NewSystemMessage(buf.String())}, nil, nil)
	if err != nil {
		if IsTerminateTeam(err) {
			return nil, err
		}
		return nil, fmt.Errorf("selector agent call failed: %w", err)
	}

	if len(result.Messages) == 0 {
		return nil, fmt.Errorf("selector agent returned no messages")
	}

	var selectedName string
	lastMsg := result.Messages[len(result.Messages)-1]
	if lastMsg.OfAssistant != nil && lastMsg.OfAssistant.Content.OfString.Value != "" {
		selectedName = strings.TrimSpace(lastMsg.OfAssistant.Content.OfString.Value)
		logger := logf.FromContext(ctx)
		logger.Info("Selector chose", "selectedName", selectedName)

	} else {
		return nil, fmt.Errorf("selector agent returned invalid response")
	}

	// Use candidateMembers if provided, otherwise use all team members
	membersToSearch := t.Members
	if candidateMembers != nil {
		membersToSearch = candidateMembers
	}

	// Find selected member
	for _, member := range membersToSearch {
		if member.GetName() == selectedName {
			return member, nil
		}
	}

	// Fallback to first member if not found
	if len(membersToSearch) > 0 {
		// This error will allow us to message to the user that the selector's response doesn't match an agent
		err := &InvalidAgentError{SelectedName: selectedName}
		fallback := membersToSearch[0]

		// Avoid repeating same member
		if fallback.GetName() == previousMember && len(membersToSearch) > 1 {
			fallback = membersToSearch[1]
		}
		return fallback, err
	}

	return nil, fmt.Errorf("no members available")
}

// determineNextMember routes to the appropriate selection logic based on whether graph constraints exist.
func (t *Team) determineNextMember(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	if len(legalTransitions) == 0 {
		// No graph constraints: use standard selector (all members available)
		participantsList := buildParticipants(t.Members)
		rolesList := buildRoles(t.Members)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, previousMember, nil)
	}
	// Graph constraints provided: use legal transitions
	return t.selectFromGraphConstraints(ctx, messages, tmpl, previousMember, legalTransitions)
}

// selectFromGraphConstraints selects a member from the graph-constrained legal transitions.
func (t *Team) selectFromGraphConstraints(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	// Build name-to-member lookup map once
	memberLookup := make(map[string]TeamMember, len(t.Members))
	for _, member := range t.Members {
		memberLookup[member.GetName()] = member
	}

	if previousMember == "" {
		// If this is the first step, choose from all available members
		participantsList := buildParticipants(t.Members)
		rolesList := buildRoles(t.Members)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, previousMember, nil)
	}

	legal := legalTransitions[previousMember]

	switch len(legal) {
	case 0:
		// No legal transitions - fallback to first member
		return t.Members[0], nil
	case 1:
		// Only one legal transition - use it directly (skip selector agent for optimization)
		selectedMember := legal[0]
		return selectedMember, nil
	default:
		// Multiple legal transitions - use selector agent to choose from candidates
		participantsList := buildParticipants(legal)
		rolesList := buildRoles(legal)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, previousMember, legal)
	}
}

func (t *Team) setupSelectorTemplate() (*template.Template, error) {
	promptTemplate := defaultSelectorPrompt
	if t.Selector != nil && t.Selector.SelectorPrompt != "" {
		promptTemplate = t.Selector.SelectorPrompt
	}

	tmpl, err := template.New("selector").Parse(promptTemplate)
	if err != nil {
		return nil, err
	}
	return tmpl, nil
}

func (t *Team) buildLegalTransitionsMap() map[string][]TeamMember {
	legalTransitions := make(map[string][]TeamMember)
	if t.Graph == nil {
		return legalTransitions
	}

	memberLookup := make(map[string]TeamMember)
	for _, member := range t.Members {
		memberLookup[member.GetName()] = member
	}

	for _, edge := range t.Graph.Edges {
		if member, exists := memberLookup[edge.To]; exists {
			legalTransitions[edge.From] = append(legalTransitions[edge.From], member)
		}
	}

	return legalTransitions
}

func (t *Team) handleMemberSelectionError(err error, newMessages *[]Message) (shouldTerminate bool, returnErr error) {
	var invalidAgentErr *InvalidAgentError
	switch {
	case errors.As(err, &invalidAgentErr):
		warningMessage := NewSystemMessage(fmt.Sprintf("Selector did not choose valid agent: returned %s", invalidAgentErr.SelectedName))
		*newMessages = append(*newMessages, warningMessage)
		return false, nil
	case IsTerminateTeam(err):
		return true, nil
	default:
		return false, err
	}
}

type turnTelemetryContext struct {
	ctx     context.Context
	span    telemetry.Span
	opData  map[string]string
	turnNum int
}

func (t *Team) startTurnTelemetry(ctx context.Context, turn int, memberName, memberType string) turnTelemetryContext {
	turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, turn, memberName, memberType)

	operationData := map[string]string{
		"teamName": t.Name,
		"strategy": t.Strategy,
		"turn":     fmt.Sprintf("%d", turn),
	}
	turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", turn, t.Name), operationData)

	return turnTelemetryContext{
		ctx:     turnCtx,
		span:    turnSpan,
		opData:  operationData,
		turnNum: turn,
	}
}

func (t *Team) recordTurnOutput(telCtx turnTelemetryContext, newMessages []Message) {
	if len(newMessages) > 0 {
		t.telemetryRecorder.RecordTurnOutput(telCtx.span, newMessages, len(newMessages))
	}
}

func (t *Team) completeTurnOnError(telCtx turnTelemetryContext, err error) (shouldTerminate bool, returnErr error) {
	t.telemetryRecorder.RecordError(telCtx.span, err)
	telCtx.span.End()
	t.eventingRecorder.Fail(telCtx.ctx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, telCtx.opData)

	if IsTerminateTeam(err) {
		return true, nil
	}
	return false, err
}

func (t *Team) completeTurnOnSuccess(telCtx turnTelemetryContext) {
	t.telemetryRecorder.RecordSuccess(telCtx.span)
	telCtx.span.End()
	t.eventingRecorder.Complete(telCtx.ctx, "TeamTurn", fmt.Sprintf("Team turn %d completed successfully", telCtx.turnNum), telCtx.opData)
}

func (t *Team) executeSelector(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	messages := append([]Message{}, history...)
	messages = append(messages, userInput)
	var newMessages []Message

	tmpl, err := t.setupSelectorTemplate()
	if err != nil {
		return newMessages, err
	}

	legalTransitions := t.buildLegalTransitionsMap()
	previousMember := ""

	for turn := 0; ; turn++ {
		nextMember, err := t.determineNextMember(ctx, messages, tmpl, previousMember, legalTransitions)
		if err != nil {
			shouldTerminate, returnErr := t.handleMemberSelectionError(err, &newMessages)
			if shouldTerminate {
				return newMessages, nil
			}
			if returnErr != nil {
				return newMessages, returnErr
			}
		}

		telCtx := t.startTurnTelemetry(ctx, turn, nextMember.GetName(), nextMember.GetType())

		err = t.executeMemberAndAccumulate(telCtx.ctx, nextMember, userInput, &messages, &newMessages, turn)

		t.recordTurnOutput(telCtx, newMessages)

		if err != nil {
			shouldTerminate, returnErr := t.completeTurnOnError(telCtx, err)
			if shouldTerminate {
				return newMessages, nil
			}
			return newMessages, returnErr
		}

		t.completeTurnOnSuccess(telCtx)

		previousMember = nextMember.GetName()

		if t.MaxTurns != nil && turn+1 >= *t.MaxTurns {
			maxTurnsMessage := NewSystemMessage(fmt.Sprintf("Team conversation reached maximum turns limit (%d)", *t.MaxTurns))
			newMessages = append(newMessages, maxTurnsMessage)
			return newMessages, nil
		}
	}
}
