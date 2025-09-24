package genai

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"text/template"

	corev1 "k8s.io/api/core/v1"
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

func (t *Team) selectMember(ctx context.Context, messages []Message, tmpl *template.Template, participantsList, rolesList, previousMember string) (TeamMember, int, error) {
	history := buildHistory(messages)
	data := SelectorTemplateData{
		Roles:        rolesList,
		Participants: participantsList,
		History:      history,
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, 0, err
	}

	model, err := LoadModel(ctx, t.Client, t.Selector, t.Namespace)
	if err != nil {
		return nil, 0, err
	}

	selectorMessages := []Message{
		NewSystemMessage(buf.String()),
		NewUserMessage("Select the next participant to respond."),
	}

	response, err := model.ChatCompletion(ctx, selectorMessages, nil, 1)
	if err != nil {
		return nil, 0, fmt.Errorf("selector model call failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return nil, 0, fmt.Errorf("selector model returned no choices")
	}

	selectedName := strings.TrimSpace(response.Choices[0].Message.Content)
	rec := NewExecutionRecorder(t.Recorder)
	rec.SelectorModelResponse(ctx, t.FullName(), model.Model, selectedName, participantsList)

	// Find selected member
	for i, member := range t.Members {
		if member.GetName() == selectedName {
			rec.ParticipantSelected(ctx, t.FullName(), selectedName, "exact_match")
			return member, i, nil
		}
	}

	// Fallback to first member if not found
	if len(t.Members) > 0 {
		fallback := t.Members[0]
		rec.ParticipantSelected(ctx, t.FullName(), fallback.GetName(), "fallback_no_match")

		// Avoid repeating same member
		if fallback.GetName() == previousMember && len(t.Members) > 1 {
			fallback = t.Members[1]
		}
		return fallback, 0, nil
	}

	return nil, 0, fmt.Errorf("no members available")
}

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

	participantsList := buildParticipants(t.Members)
	rolesList := buildRoles(t.Members)
	previousMember := ""

	for turn := 0; ; turn++ {
		turnTracker := NewExecutionRecorder(t.Recorder)
		turnTracker.TeamTurn(ctx, "Start", t.FullName(), t.Strategy, turn)

		nextMember, memberIndex, err := t.selectMember(ctx, messages, tmpl, participantsList, rolesList, previousMember)
		if err != nil {
			return newMessages, err
		}

		if err := t.executeMemberAndAccumulate(ctx, nextMember, userInput, &messages, &newMessages, memberIndex); err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

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
