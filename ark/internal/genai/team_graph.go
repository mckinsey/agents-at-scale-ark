package genai

import (
	"context"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	"mckinsey.com/ark/internal/telemetry"
)

func (t *Team) finishGraphTurn(err error, turnSpan telemetry.Span, turnCtx context.Context, turns int, operationData map[string]string, newMessages, turnMessages []protocol.Message) ([]protocol.Message, error) {
	if len(turnMessages) > 0 {
		t.telemetryRecorder.RecordTurnOutput(turnSpan, turnMessages, len(turnMessages))
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
	return nil, nil
}

//nolint:dupl // A2A variant intentionally mirrors executeGraph for separate removability
func (t *Team) executeGraphA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	if len(t.Members) == 0 {
		return nil, fmt.Errorf("team %s has no members for graph execution", t.FullName())
	}

	messages := append([]protocol.Message{}, history...)
	var newMessages []protocol.Message

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
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}
		member, exists := memberMap[currentMemberName]
		if !exists {
			return newMessages, fmt.Errorf("member %s not found in team %s", currentMemberName, t.FullName())
		}

		turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, turns, member.GetName(), member.GetType())

		operationData := map[string]string{
			"teamName": t.Name,
			"strategy": t.Strategy,
			"turn":     fmt.Sprintf("%d", turns),
		}
		turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", turns, t.Name), operationData)

		beforeCount := len(newMessages)
		err := t.executeMemberAndAccumulateA2A(turnCtx, member, userInput, &messages, &newMessages, turns)
		turnMessages := newMessages[beforeCount:]

		retMsgs, retErr := t.finishGraphTurn(err, turnSpan, turnCtx, turns, operationData, newMessages, turnMessages)
		if retMsgs != nil {
			return retMsgs, retErr
		}

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
