package genai

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"text/template"

	"k8s.io/apimachinery/pkg/types"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

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
	history := make([]string, 0, len(messages))
	for _, msg := range messages {
		role := resolveMessageRole(msg)
		text := ExtractTextFromMessage(msg)
		if text == "" {
			continue
		}
		switch role {
		case RoleAssistant:
			history = append(history, fmt.Sprintf("# assistant:\n%s\n", text))
		case RoleUser:
			history = append(history, fmt.Sprintf("# user:\n%s\n", text))
		}
	}
	return strings.Join(history, "\n")
}

func buildA2AHistory(messages []protocol.Message) string {
	history := make([]string, 0, len(messages))
	for _, msg := range messages {
		text := ExtractA2ATextFromMessage(msg)
		if text == "" {
			continue
		}
		if msg.Role == protocol.MessageRoleUser {
			history = append(history, fmt.Sprintf("# user:\n%s\n", text))
			continue
		}
		label := "assistant"
		if name := getAgentNameFromMessage(msg); name != "" {
			label = name
		}
		history = append(history, fmt.Sprintf("# %s:\n%s\n", label, text))
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

func resolveSelectedMemberName(raw string, members []TeamMember) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	for _, member := range members {
		if member.GetName() == trimmed {
			return member.GetName()
		}
	}
	for _, member := range members {
		if strings.EqualFold(member.GetName(), trimmed) {
			return member.GetName()
		}
	}
	lower := strings.ToLower(trimmed)
	for _, member := range members {
		if strings.Contains(lower, strings.ToLower(member.GetName())) {
			return member.GetName()
		}
	}
	return ""
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
	if resolveMessageRole(lastMsg) == RoleAssistant {
		selectedName = strings.TrimSpace(ExtractTextFromMessage(lastMsg))
	}
	if selectedName == "" {
		return nil, fmt.Errorf("selector agent returned invalid response")
	}

	// Use candidateMembers if provided, otherwise use all team members
	membersToSearch := t.Members
	if candidateMembers != nil {
		membersToSearch = candidateMembers
	}

	selectedName = resolveSelectedMemberName(selectedName, membersToSearch)
	if selectedName == "" {
		selectedName = strings.TrimSpace(ExtractTextFromMessage(lastMsg))
	}
	for _, member := range membersToSearch {
		if member.GetName() == selectedName {
			return member, nil
		}
	}

	// Fallback to first member if not found
	if len(membersToSearch) > 0 {
		fallback := membersToSearch[0]

		// Avoid repeating same member
		if fallback.GetName() == previousMember && len(membersToSearch) > 1 {
			fallback = membersToSearch[1]
		}
		return fallback, nil
	}

	return nil, fmt.Errorf("no members available")
}

//nolint:dupl // A2A variant intentionally mirrors selectMember for separate removability
func (t *Team) selectMemberA2A(ctx context.Context, messages []protocol.Message, tmpl *template.Template, participantsList, rolesList, previousMember string, candidateMembers []TeamMember) (TeamMember, error) {
	history := buildA2AHistory(messages)
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

	systemMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(buf.String()),
	})
	systemMessage.Metadata = map[string]interface{}{
		MetadataRoleKey: RoleSystem,
	}

	result, err := selectorAgent.ExecuteA2A(ctx, protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("Select the next participant to respond."),
	}), []protocol.Message{systemMessage}, nil, nil)
	if err != nil {
		if IsTerminateTeam(err) {
			return nil, err
		}
		return nil, fmt.Errorf("selector agent call failed: %w", err)
	}

	resultMessages, err := extractA2AMessages(result)
	if err != nil || len(resultMessages) == 0 {
		return nil, fmt.Errorf("selector agent returned no messages")
	}

	selectedName := strings.TrimSpace(ExtractA2ATextFromMessage(resultMessages[len(resultMessages)-1]))
	if selectedName == "" {
		return nil, fmt.Errorf("selector agent returned invalid response")
	}

	membersToSearch := t.Members
	if candidateMembers != nil {
		membersToSearch = candidateMembers
	}
	selectedName = resolveSelectedMemberName(selectedName, membersToSearch)
	if selectedName == "" {
		selectedName = strings.TrimSpace(ExtractA2ATextFromMessage(resultMessages[len(resultMessages)-1]))
	}
	for _, member := range membersToSearch {
		if member.GetName() == selectedName {
			return member, nil
		}
	}

	if len(membersToSearch) > 0 {
		fallback := membersToSearch[0]
		if fallback.GetName() == previousMember && len(membersToSearch) > 1 {
			fallback = membersToSearch[1]
		}
		return fallback, nil
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

func (t *Team) determineNextMemberA2A(ctx context.Context, messages []protocol.Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	switch {
	case previousMember == "":
		if len(legalTransitions) == 0 {
			participantsList := buildParticipants(t.Members)
			rolesList := buildRoles(t.Members)
			return t.selectMemberA2A(ctx, messages, tmpl, participantsList, rolesList, previousMember, nil)
		}
		return t.selectFromGraphConstraintsA2A(ctx, messages, tmpl, previousMember, legalTransitions)
	case len(legalTransitions) == 0:
		participantsList := buildParticipants(t.Members)
		rolesList := buildRoles(t.Members)
		return t.selectMemberA2A(ctx, messages, tmpl, participantsList, rolesList, previousMember, nil)
	default:
		return t.selectFromGraphConstraintsA2A(ctx, messages, tmpl, previousMember, legalTransitions)
	}
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

func (t *Team) selectFromGraphConstraintsA2A(ctx context.Context, messages []protocol.Message, tmpl *template.Template, previousMember string, legalTransitions map[string][]TeamMember) (TeamMember, error) {
	memberLookup := make(map[string]TeamMember, len(t.Members))
	for _, member := range t.Members {
		memberLookup[member.GetName()] = member
	}

	if previousMember == "" {
		participantsList := buildParticipants(t.Members)
		rolesList := buildRoles(t.Members)
		return t.selectMemberA2A(ctx, messages, tmpl, participantsList, rolesList, previousMember, nil)
	}

	previousMemberObj := memberLookup[previousMember]
	if previousMemberObj == nil {
		return t.Members[0], nil
	}

	legal := legalTransitions[previousMember]

	switch len(legal) {
	case 0:
		return t.Members[0], nil
	case 1:
		selectedMember := legal[0]
		return selectedMember, nil
	default:
		participantsList := buildParticipants(legal)
		rolesList := buildRoles(legal)
		return t.selectMemberA2A(ctx, messages, tmpl, participantsList, rolesList, previousMember, legal)
	}
}

func (t *Team) resolveSelectorTemplate() (*template.Template, error) {
	promptTemplate := defaultSelectorPrompt
	if t.Selector != nil && t.Selector.SelectorPrompt != "" {
		promptTemplate = t.Selector.SelectorPrompt
	}
	return template.New("selector").Parse(promptTemplate)
}

func (t *Team) buildLegalTransitions() map[string][]TeamMember {
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

func (t *Team) executeSelectorA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	messages := append([]protocol.Message{}, history...)
	var newMessages []protocol.Message

	tmpl, err := t.resolveSelectorTemplate()
	if err != nil {
		return newMessages, err
	}

	legalTransitions := t.buildLegalTransitions()
	previousMember := ""

	for turn := 0; ; turn++ {
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}
		nextMember, err := t.determineNextMemberA2A(ctx, messages, tmpl, previousMember, legalTransitions)
		if err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		done, err := t.executeSelectorTurnA2A(ctx, turn, nextMember, userInput, &messages, &newMessages)
		if err != nil {
			return newMessages, err
		}
		previousMember = nextMember.GetName()
		if done {
			return newMessages, nil
		}
	}
}

func (t *Team) executeSelectorTurnA2A(ctx context.Context, turn int, member TeamMember, userInput protocol.Message, messages, newMessages *[]protocol.Message) (bool, error) {
	turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, turn, member.GetName(), member.GetType())

	operationData := map[string]string{
		"teamName": t.Name,
		"strategy": t.Strategy,
		"turn":     fmt.Sprintf("%d", turn),
	}
	turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", turn, t.Name), operationData)

	beforeCount := len(*newMessages)
	err := t.executeMemberAndAccumulateA2A(turnCtx, member, userInput, messages, newMessages, turn)

	turnMessages := (*newMessages)[beforeCount:]
	if len(turnMessages) > 0 {
		t.telemetryRecorder.RecordTurnOutput(turnSpan, turnMessages, len(turnMessages))
	}

	if err != nil {
		t.telemetryRecorder.RecordError(turnSpan, err)
		turnSpan.End()
		t.eventingRecorder.Fail(turnCtx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, operationData)
		if IsTerminateTeam(err) {
			return true, nil
		}
		return false, err
	}

	t.telemetryRecorder.RecordSuccess(turnSpan)
	turnSpan.End()
	t.eventingRecorder.Complete(turnCtx, "TeamTurn", fmt.Sprintf("Team turn %d completed successfully", turn), operationData)

	if t.MaxTurns != nil && turn+1 >= *t.MaxTurns {
		return true, nil
	}
	return false, nil
}
