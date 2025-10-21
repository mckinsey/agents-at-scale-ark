/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
)

type ExecutionRecorder struct {
	emitter EventEmitter
}

func NewExecutionRecorder(emitter EventEmitter) *ExecutionRecorder {
	return &ExecutionRecorder{emitter: emitter}
}

func (r *ExecutionRecorder) TeamExecution(ctx context.Context, phase, teamName, strategy string, metadata map[string]string) {
	if metadata == nil {
		metadata = make(map[string]string)
	}
	metadata["strategy"] = strategy

	event := ExecutionEvent{
		BaseEvent: BaseEvent{
			Name:     teamName,
			Metadata: metadata,
		},
		Type: "team",
	}
	r.emitter.EmitEvent(ctx, corev1.EventTypeNormal, "Team"+phase, event)
}

func (r *ExecutionRecorder) TeamMember(ctx context.Context, phase, teamName, memberType, memberName string, turn int) {
	event := ExecutionEvent{
		BaseEvent: BaseEvent{
			Name: memberName,
			Metadata: map[string]string{
				"team":       teamName,
				"memberType": memberType,
				"turn":       fmt.Sprintf("%d", turn),
			},
		},
		Type: memberType,
	}
	r.emitter.EmitEvent(ctx, corev1.EventTypeNormal, "TeamMember"+phase, event)
}

func (r *ExecutionRecorder) TeamTurn(ctx context.Context, phase, teamName, strategy string, turn int) {
	event := ExecutionEvent{
		BaseEvent: BaseEvent{
			Name: teamName,
			Metadata: map[string]string{
				"strategy": strategy,
				"turn":     fmt.Sprintf("%d", turn),
			},
		},
		Type: "turn",
	}
	r.emitter.EmitEvent(ctx, corev1.EventTypeNormal, "TeamTurn"+phase, event)
}

func (r *ExecutionRecorder) AgentExecution(ctx context.Context, phase, agentName, modelName string) {
	event := ExecutionEvent{
		BaseEvent: BaseEvent{
			Name: agentName,
			Metadata: map[string]string{
				"model": modelName,
			},
		},
		Type: "agent",
	}
	r.emitter.EmitEvent(ctx, corev1.EventTypeNormal, "Agent"+phase, event)
}

func (r *ExecutionRecorder) ParticipantSelected(ctx context.Context, teamName, selectedParticipant, selectionReason string) {
	event := ExecutionEvent{
		BaseEvent: BaseEvent{
			Name: teamName,
			Metadata: map[string]string{
				"selected_participant": selectedParticipant,
				"selection_reason":     selectionReason,
			},
		},
		Type: "team_selector",
	}
	r.emitter.EmitEvent(ctx, corev1.EventTypeNormal, "ParticipantSelected", event)
}

func (r *ExecutionRecorder) SelectorAgentResponse(ctx context.Context, teamName, agentName, selectedName, availableParticipants string) {
	event := ExecutionEvent{
		BaseEvent: BaseEvent{
			Name: teamName,
			Metadata: map[string]string{
				"agent":                  agentName,
				"selected_name":          selectedName,
				"available_participants": availableParticipants,
			},
		},
		Type: "team_selector_response",
	}
	r.emitter.EmitEvent(ctx, corev1.EventTypeNormal, "SelectorAgentResponse", event)
}
