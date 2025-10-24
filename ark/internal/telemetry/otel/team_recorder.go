/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"
	"fmt"

	"mckinsey.com/ark/internal/telemetry"
)

type teamRecorder struct {
	tracer telemetry.Tracer
}

func NewTeamRecorder(tracer telemetry.Tracer) telemetry.TeamRecorder {
	return &teamRecorder{
		tracer: tracer,
	}
}

func (r *teamRecorder) StartTeamExecution(ctx context.Context, teamName, namespace, strategy string, memberCount, maxTurns int) (context.Context, telemetry.Span) {
	spanName := fmt.Sprintf("team.%s/%s", namespace, teamName)
	return r.tracer.Start(ctx, spanName,
		telemetry.WithSpanKind(telemetry.SpanKindChain),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrTeamName, teamName),
			telemetry.String(telemetry.AttrQueryNamespace, namespace),
			telemetry.String("team.strategy", strategy),
			telemetry.Int("team.member_count", memberCount),
			telemetry.Int("team.max_turns", maxTurns),
			telemetry.String(telemetry.AttrComponentName, "team"),
			telemetry.String("type", telemetry.ObservationTypeAgent),
			telemetry.String("name", teamName),
		),
	)
}

func (r *teamRecorder) StartTurn(ctx context.Context, turn int, memberName, memberType string) (context.Context, telemetry.Span) {
	spanName := fmt.Sprintf("turn.%d", turn)
	return r.tracer.Start(ctx, spanName,
		telemetry.WithSpanKind(telemetry.SpanKindInternal),
		telemetry.WithAttributes(
			telemetry.Int("turn.number", turn),
			telemetry.String("turn.member.name", memberName),
			telemetry.String("turn.member.type", memberType),
			telemetry.String(telemetry.AttrComponentName, "team.turn"),
			telemetry.String("type", telemetry.ObservationTypeAgent),
			telemetry.String("name", fmt.Sprintf("Turn %d: %s", turn, memberName)),
		),
	)
}

func (r *teamRecorder) RecordTurnOutput(span telemetry.Span, messages any, messageCount int) {
	if messages == nil {
		return
	}

	span.SetAttributes(telemetry.Int("turn.output_message_count", messageCount))

	if slice, ok := messages.([]interface{}); ok && len(slice) > 0 {
		lastMessage := slice[len(slice)-1]
		if msgMap, ok := lastMessage.(map[string]interface{}); ok {
			if content, ok := msgMap["content"].(string); ok && content != "" {
				span.SetAttributes(telemetry.String("turn.output", content))
			}
		}
	}
}

func (r *teamRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

func (r *teamRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *teamRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}
