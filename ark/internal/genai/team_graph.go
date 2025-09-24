package genai

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
)

func (t *Team) executeGraph(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	if len(t.Members) == 0 {
		return nil, fmt.Errorf("team %s has no members for graph execution", t.FullName())
	}

	messages := append([]Message{}, history...)
	var newMessages []Message

	memberMap := make(map[string]TeamMember)
	for _, member := range t.Members {
		memberMap[member.GetName()] = member
	}

	transitionMap := make(map[string]string)
	if t.Graph != nil {
		for _, edge := range t.Graph.Edges {
			transitionMap[edge.From] = edge.To
		}
	}

	turnTracker := NewExecutionRecorder(t.Recorder)
	turnTracker.TeamTurn(ctx, "Start", t.FullName(), t.Strategy, 0)

	currentMemberName := t.Members[0].GetName()

	for turns := 0; ; turns++ {
		member, exists := memberMap[currentMemberName]
		if !exists {
			return newMessages, fmt.Errorf("member %s not found in team %s", currentMemberName, t.FullName())
		}

		memberTracker := NewExecutionRecorder(t.Recorder)
		memberTracker.ParticipantSelected(ctx, t.FullName(), currentMemberName, "graph")

		if err := t.executeMemberAndAccumulate(ctx, member, userInput, &messages, &newMessages, turns); err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		nextMember := transitionMap[currentMemberName]
		if nextMember == "" {
			break
		}

		currentMemberName = nextMember

		if t.MaxTurns != nil && turns+1 >= *t.MaxTurns {
			turnTracker.TeamTurn(ctx, "MaxTurns", t.FullName(), t.Strategy, turns+1)
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

	return newMessages, nil
}
