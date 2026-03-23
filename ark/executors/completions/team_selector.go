package completions

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
	return fmt.Sprintf("Selector returned invalid agent name: %s", e.SelectedName)
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
func (t *Team) selectMember(ctx context.Context, messages []Message, tmpl *template.Template, participantsList, rolesList string, candidateMembers []TeamMember) (TeamMember, error) {
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

	if len(membersToSearch) > 0 {
		// This error will allow us to message to the user that the selector's response doesn't match an agent
		err := &InvalidAgentError{SelectedName: selectedName}
		return nil, err
	}

	return nil, fmt.Errorf("no members available")
}

// determineNextMember routes to the appropriate selection logic based on whether graph constraints exist.
func (t *Team) determineNextMember(ctx context.Context, messages []Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	if len(legalTransitions) == 0 {
		// No graph constraints: use standard selector (all members available)
		participantsList := buildParticipants(t.Members)
		rolesList := buildRoles(t.Members)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, nil)
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
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, nil)
	}

	legal := legalTransitions[previousMember]

	switch len(legal) {
	case 0:
		// No legal transitions - use the TerminateTeam error to end early
		return nil, NewTerminateTeamWithReason("no onward transitions")
	case 1:
		// Only one legal transition - use it directly (skip selector agent for optimization)
		selectedMember := legal[0]
		return selectedMember, nil
	default:
		// Multiple legal transitions - use selector agent to choose from candidates
		participantsList := buildParticipants(legal)
		rolesList := buildRoles(legal)
		return t.selectMember(ctx, messages, tmpl, participantsList, rolesList, legal)
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

func (t *Team) handleMemberSelectionError(ctx context.Context, err error, newMessages *[]Message) (shouldTerminate bool, returnErr error) {
	var invalidAgentErr *InvalidAgentError
	switch {
	case errors.As(err, &invalidAgentErr):
		warningContent := fmt.Sprintf("Selector returned invalid agent name: %s", invalidAgentErr.SelectedName)
		warningMessage := NewSystemMessage(warningContent)
		*newMessages = append(*newMessages, warningMessage)

		// Stream the warning message immediately so it appears during execution
		StreamSystemMessage(ctx, t.eventStream, warningContent)
		return true, nil
	case IsTerminateTeam(err):
		return true, nil
	default:
		return false, err
	}
}

type turnTelemetry struct {
	span    telemetry.Span
	opData  map[string]string
	turnNum int
}

func (t *Team) startTurnTelemetry(ctx context.Context, turn int, memberName, memberType string) (context.Context, turnTelemetry) {
	turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, turn, memberName, memberType)

	operationData := map[string]string{
		"teamName": t.Name,
		"strategy": t.Strategy,
		"turn":     fmt.Sprintf("%d", turn),
	}
	turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", turn, t.Name), operationData)

	return turnCtx, turnTelemetry{
		span:    turnSpan,
		opData:  operationData,
		turnNum: turn,
	}
}

func (t *Team) recordTurnOutput(tel turnTelemetry, newMessages []Message) {
	if len(newMessages) > 0 {
		t.telemetryRecorder.RecordTurnOutput(tel.span, newMessages, len(newMessages))
	}
}

func (t *Team) completeTurnOnError(ctx context.Context, tel turnTelemetry, err error) (shouldTerminate bool, returnErr error) {
	t.telemetryRecorder.RecordError(tel.span, err)
	tel.span.End()
	t.eventingRecorder.Fail(ctx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, tel.opData)

	if IsTerminateTeam(err) {
		return true, nil
	}
	return false, err
}

func (t *Team) completeTurnOnSuccess(ctx context.Context, tel turnTelemetry) {
	t.telemetryRecorder.RecordSuccess(tel.span)
	tel.span.End()
	t.eventingRecorder.Complete(ctx, "TeamTurn", fmt.Sprintf("Team turn %d completed successfully", tel.turnNum), tel.opData)
}

func (t *Team) checkAndHandleMaxTurns(turn int, newMessages *[]Message) bool {
	if t.MaxTurns != nil && turn+1 >= *t.MaxTurns {
		maxTurnsMessage := NewSystemMessage(fmt.Sprintf("Team conversation reached maximum turns limit (%d)", *t.MaxTurns))
		*newMessages = append(*newMessages, maxTurnsMessage)
		return true
	}
	return false
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
			shouldTerminate, returnErr := t.handleMemberSelectionError(ctx, err, &newMessages)
			if shouldTerminate {
				return newMessages, nil
			}
			if returnErr != nil {
				return newMessages, returnErr
			}
		}

		turnCtx, tel := t.startTurnTelemetry(ctx, turn, nextMember.GetName(), nextMember.GetType())

		err = t.executeMemberAndAccumulate(turnCtx, nextMember, userInput, &messages, &newMessages, turn)

		t.recordTurnOutput(tel, newMessages)

		if err != nil {
			shouldTerminate, returnErr := t.completeTurnOnError(turnCtx, tel, err)
			if shouldTerminate {
				return newMessages, nil
			}
			return newMessages, returnErr
		}

		t.completeTurnOnSuccess(turnCtx, tel)

		previousMember = nextMember.GetName()

		if t.checkAndHandleMaxTurns(turn, &newMessages) {
			return newMessages, nil
		}
	}
}
