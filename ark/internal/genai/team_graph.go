package genai

import (
	"context"
	"fmt"
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

	currentMemberName := t.Members[0].GetName()

	for turns := 0; ; turns++ {
		member, exists := memberMap[currentMemberName]
		if !exists {
			return newMessages, fmt.Errorf("member %s not found in team %s", currentMemberName, t.FullName())
		}

		// Start turn-level telemetry span
		turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, turns, member.GetName(), member.GetType())

		operationData := map[string]string{
			"teamName": t.Name,
			"strategy": t.Strategy,
			"turn":     fmt.Sprintf("%d", turns),
		}
		turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", turns, t.Name), operationData)

		err := t.executeMemberAndAccumulate(turnCtx, member, userInput, &messages, &newMessages, turns)

		// Record turn output
		if len(newMessages) > 0 {
			t.telemetryRecorder.RecordTurnOutput(turnSpan, newMessages, len(newMessages))
		}

		if err != nil {
			t.telemetryRecorder.RecordError(turnSpan, err)
			turnSpan.End()
			t.eventingRecorder.Fail(turnCtx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, operationData)
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		t.telemetryRecorder.RecordSuccess(turnSpan)
		turnSpan.End()
		t.eventingRecorder.Complete(turnCtx, "TeamTurn", fmt.Sprintf("Team turn %d completed successfully", turns), operationData)

		nextMember := transitionMap[currentMemberName]
		if nextMember == "" {
			break
		}

		currentMemberName = nextMember

		if t.MaxTurns != nil && turns+1 >= *t.MaxTurns {
			return newMessages, nil
		}
	}

	return newMessages, nil
}
