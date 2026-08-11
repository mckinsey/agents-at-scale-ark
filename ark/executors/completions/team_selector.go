package completions

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"text/template"

	"k8s.io/apimachinery/pkg/types"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/telemetry"
)

const defaultSelectorPrompt = `You are in a role play game. The following roles are available:
{{.Roles}}.
Read the following conversation, then use the select-next-speaker tool to select the next role from {{.Participants}} to play.

{{.History}}

Read the above conversation, then use the select-next-speaker tool to select the next role from {{.Participants}} to play.`

const defaultTerminatePrompt = `If the most recent user message has been given an adequate response, do not return a role. Instead call the terminate tool.`

// engineTerminateToken is how an engine-backed selector says "we are done".
// The terminate tool is registered in-process and can never reach an external
// engine, so without a text equivalent such a selector has no way to end a run
// and can only loop to maxTurns. Anything after the token is the selector's
// closing response, mirroring the payload a local selector returns through the
// terminate tool.
const engineTerminateToken = "TERMINATE"

// parseEngineTerminate reports whether an engine-backed selector's reply asks to
// terminate, and returns any closing response that followed the token. The token
// must stand alone or be followed by punctuation or whitespace, so a candidate
// named "terminated-agent" is not mistaken for a termination.
func parseEngineTerminate(reply string) (string, bool) {
	trimmed := strings.TrimSpace(reply)
	if len(trimmed) < len(engineTerminateToken) || !strings.EqualFold(trimmed[:len(engineTerminateToken)], engineTerminateToken) {
		return "", false
	}

	rest := trimmed[len(engineTerminateToken):]
	if rest == "" {
		return "", true
	}
	switch rest[0] {
	case ':', '.', '-', ' ', '\t', '\n', '\r':
	default:
		return "", false
	}

	return strings.TrimSpace(strings.TrimLeft(rest, ":.- \t\n\r")), true
}

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
	// Return cached selector agent if already loaded (test mock or production cache)
	if t.selectorAgent != nil {
		return t.selectorAgent, nil
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

	agent.Tools.ClearTools()

	if t.Selector.EnableTerminateTool != nil && *t.Selector.EnableTerminateTool {
		agent.Tools.RegisterTool(GetTerminateTool(), &TerminateExecutor{})
	}

	t.selectorAgent = agent

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

	// A named engine executes the agent out of process, where the runtime
	// select-next-speaker tool does not exist, so ask for a plain-text name and
	// match it against the candidates instead.
	engineBacked := arka2a.IsNamedEngine(selectorAgent.GetExecutionEngine())

	selectorMessage := buf.String()
	if engineBacked {
		selectorMessage += fmt.Sprintf("\n\nIgnore any instruction above to use a tool: no tools are available to you. Reply with only the name of the next speaker, exactly as written in %s, and nothing else.", participantsList)
	} else {
		selectorMessage += "\n\nUse the select-next-speaker tool to express your next speaker selection."
	}

	terminateEnabled := t.Selector != nil && t.Selector.EnableTerminateTool != nil && *t.Selector.EnableTerminateTool
	if terminateEnabled {
		if engineBacked {
			// The configured terminate prompt tells the model to call a tool it
			// cannot reach, so give an engine the text equivalent instead.
			selectorMessage = fmt.Sprintf("%s\n\nIf the most recent user message has already been answered adequately, reply with %s instead of a name. You may follow it with a colon and a closing response to the user.", selectorMessage, engineTerminateToken)
		} else {
			terminatePrompt := defaultTerminatePrompt
			if t.Selector.TerminatePrompt != "" {
				terminatePrompt = t.Selector.TerminatePrompt
			}
			selectorMessage = selectorMessage + "\n\n" + terminatePrompt
		}
	}

	membersToSearch := t.Members
	if candidateMembers != nil {
		membersToSearch = candidateMembers
	}

	candidateNames := make([]string, len(membersToSearch))
	for i, m := range membersToSearch {
		candidateNames[i] = m.GetName()
	}
	if len(candidateNames) == 0 {
		return nil, NewTerminateTeamWithReason("no candidates available for selection")
	}
	userPrompt := "Select the next speaker to respond using the select-next-speaker tool."
	opts := ExecuteOptions{ToolChoice: ToolChoiceRequired}
	if engineBacked {
		userPrompt = "Reply with only the name of the next speaker to respond."
		if terminateEnabled {
			userPrompt = fmt.Sprintf("Reply with only the name of the next speaker to respond, or %s (optionally followed by a colon and a closing response) if the original question has been answered.", engineTerminateToken)
		}
		opts = ExecuteOptions{}
	} else {
		if err := t.registerSelectNextSpeakerTool(ctx, selectorAgent, candidateNames); err != nil {
			return nil, err
		}
		if terminateEnabled {
			userPrompt = "Select the next speaker to respond using the select-next-speaker tool, or use the terminate tool if you think the user's original question has been answered."
		}
	}

	result, err := selectorAgent.Execute(ctx, NewUserMessage(userPrompt), []Message{NewSystemMessage(selectorMessage)}, nil, nil, opts)
	if err != nil {
		return nil, fmt.Errorf("selector agent call failed: %w", err)
	}

	if engineBacked && result.Signal == nil {
		return t.resolveEngineSelection(ctx, result, terminateEnabled, candidateNames, membersToSearch)
	}

	if result.Signal == nil {
		return nil, &ToolNotCalledError{}
	}

	if sig, ok := result.Signal.(*SelectionMadeSignal); ok {
		return t.resolveSelectedMember(ctx, sig.SelectedName, membersToSearch)
	}

	if _, ok := result.Signal.(*TerminateSignal); ok {
		if response := extractTerminateToolResponse(result); response != "" {
			return nil, &TerminateTeamWithResponse{Response: response, Messages: result.Messages}
		}
		return nil, NewTerminateTeamWithReason("selector agent terminated")
	}

	return nil, fmt.Errorf("selector agent returned unexpected signal: %s", result.Signal.SignalType())
}

// matchSelectedName resolves the free-text reply of an engine-backed selector to
// a candidate name: an exact match first, then case-insensitive, then a single
// candidate mentioned somewhere in the reply. A candidate contained in another
// matched candidate is discarded, so "agent-2" wins over "agent" rather than
// reading as ambiguous. No match, or a genuinely ambiguous one, is an
// InvalidAgentError, which the selector loop already handles.
func matchSelectedName(response string, candidates []string) (string, error) {
	selected := strings.TrimSpace(response)

	if slices.Contains(candidates, selected) {
		return selected, nil
	}

	for _, candidate := range candidates {
		if strings.EqualFold(candidate, selected) {
			return candidate, nil
		}
	}

	lowered := strings.ToLower(selected)
	var mentioned []string
	for _, candidate := range candidates {
		if strings.Contains(lowered, strings.ToLower(candidate)) {
			mentioned = append(mentioned, candidate)
		}
	}

	var longest []string
	for _, candidate := range mentioned {
		contained := slices.ContainsFunc(mentioned, func(other string) bool {
			return other != candidate && strings.Contains(strings.ToLower(other), strings.ToLower(candidate))
		})
		if !contained {
			longest = append(longest, candidate)
		}
	}

	if len(longest) == 1 {
		return longest[0], nil
	}

	return "", &InvalidAgentError{SelectedName: selected}
}

// resolveEngineSelection interprets an engine-backed selector's free-text reply:
// a termination (optionally carrying a closing response), or the name of the next
// speaker. An engine cannot call the select-next-speaker or terminate tools, so
// both outcomes have to be expressed in, and read back out of, plain text.
func (t *Team) resolveEngineSelection(ctx context.Context, result *ExecutionResult, terminateEnabled bool, candidateNames []string, membersToSearch []TeamMember) (TeamMember, error) {
	reply := ExtractLastAssistantMessageContent(result.Messages)

	if terminateEnabled {
		if response, terminated := parseEngineTerminate(reply); terminated {
			if response != "" {
				// Carry the parsed response, not the raw reply. These messages are
				// appended to the team transcript and become the query's final
				// content, so passing result.Messages through would surface the
				// TERMINATE control token to the user — and disagree with the
				// stream, which already receives the parsed text.
				return nil, &TerminateTeamWithResponse{
					Response: response,
					Messages: []Message{NewAssistantMessage(response)},
				}
			}
			return nil, NewTerminateTeamWithReason("selector agent terminated")
		}
	}

	selectedName, err := matchSelectedName(reply, candidateNames)
	if err != nil {
		return nil, err
	}
	return t.resolveSelectedMember(ctx, selectedName, membersToSearch)
}

func (t *Team) resolveSelectedMember(ctx context.Context, selectedName string, members []TeamMember) (TeamMember, error) {
	logger := logf.FromContext(ctx)
	logger.Info("Selector chose", "selectedName", selectedName)
	for _, member := range members {
		if member.GetName() == selectedName {
			return member, nil
		}
	}
	return nil, &InvalidAgentError{SelectedName: selectedName}
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

func (t *Team) registerSelectNextSpeakerTool(_ context.Context, selectorAgent SelectorAgentInterface, candidates []string) error {
	registry := selectorAgent.GetToolRegistry()
	if registry == nil {
		return fmt.Errorf("select-next-speaker tool requires a selector agent with a tool registry")
	}
	registry.RemoveTool(BuiltinToolSelectNextSpeaker)
	registry.RegisterTool(GetSelectNextSpeakerTool(candidates), &SelectNextSpeakerExecutor{})
	return nil
}

func extractTerminateToolResponse(result *ExecutionResult) string {
	if result == nil {
		return ""
	}
	for i := len(result.Messages) - 1; i >= 0; i-- {
		if msg := result.Messages[i]; msg.OfTool != nil {
			return msg.OfTool.Content.OfString.Value
		}
	}
	return ""
}

func (t *Team) handleMemberSelectionError(ctx context.Context, err error, newMessages *[]Message) (shouldTerminate bool, returnErr error) {
	var invalidAgentErr *InvalidAgentError
	var toolNotCalledErr *ToolNotCalledError
	switch {
	case errors.As(err, &invalidAgentErr):
		warningContent := fmt.Sprintf("Selector returned invalid agent name: %s", invalidAgentErr.SelectedName)
		warningMessage := NewSystemMessage(warningContent)
		*newMessages = append(*newMessages, warningMessage)

		StreamSystemMessage(ctx, t.eventStream, warningContent)
		return true, nil
	case errors.As(err, &toolNotCalledErr):
		warningContent := "Selector agent did not use the select-next-speaker tool"
		warningMessage := NewSystemMessage(warningContent)
		*newMessages = append(*newMessages, warningMessage)

		StreamSystemMessage(ctx, t.eventStream, warningContent)
		return true, nil
	case IsTerminateTeam(err):
		var withResponse *TerminateTeamWithResponse
		if errors.As(err, &withResponse) && withResponse.Response != "" {
			*newMessages = append(*newMessages, withResponse.Messages...)
			if t.eventStream != nil {
				chunk := NewContentChunk("chatcmpl-terminate", "", withResponse.Response)
				chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, "", nil)
				if streamErr := t.eventStream.StreamChunk(ctx, chunkWithMeta); streamErr != nil {
					logf.FromContext(ctx).Error(streamErr, "failed to stream terminate response")
				}
			}
		}
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
		t.telemetryRecorder.RecordTurnOutput(tel.span, ExtractLastAssistantMessageContent(newMessages), len(newMessages))
	}
}

func (t *Team) completeTurnOnError(ctx context.Context, tel turnTelemetry, err error) {
	t.telemetryRecorder.RecordError(tel.span, err)
	tel.span.End()
	t.eventingRecorder.Fail(ctx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, tel.opData)
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

		signal, err := t.executeMemberAndAccumulate(turnCtx, nextMember, userInput, &messages, &newMessages, turn)

		t.recordTurnOutput(tel, newMessages)

		if err != nil {
			t.completeTurnOnError(turnCtx, tel, err)
			return newMessages, err
		}

		t.completeTurnOnSuccess(turnCtx, tel)

		if _, ok := signal.(*TerminateSignal); ok {
			return newMessages, nil
		}

		previousMember = nextMember.GetName()

		if t.checkAndHandleMaxTurns(turn, &newMessages) {
			return newMessages, nil
		}
	}
}
