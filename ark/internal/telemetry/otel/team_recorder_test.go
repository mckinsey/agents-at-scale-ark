/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"mckinsey.com/ark/internal/telemetry"
	telemetrymock "mckinsey.com/ark/internal/telemetry/mock"
)

func TestTeamRecorder(t *testing.T) {
	tracer := telemetrymock.NewTracer()
	recorder := NewTeamRecorder(tracer)
	ctx := context.Background()

	t.Run("StartTurn names span with turn number", func(t *testing.T) {
		_, span := recorder.StartTurn(ctx, 1, "agent-a", "agent")
		mockSpan, ok := span.(*telemetrymock.MockSpan)
		require.True(t, ok)
		assert.Equal(t, "turn.1", mockSpan.Name)
		assert.Equal(t, "agent-a", mockSpan.Attributes["turn.member.name"])
	})

	t.Run("RecordTurnOutput sets turn.output and count", func(t *testing.T) {
		_, span := recorder.StartTurn(ctx, 0, "agent-a", "agent")
		recorder.RecordTurnOutput(span, "I AM AGENT A", 2)
		mockSpan := span.(*telemetrymock.MockSpan)
		assert.Equal(t, "I AM AGENT A", mockSpan.Attributes["turn.output"])
		assert.Equal(t, 2, mockSpan.Attributes["turn.output_message_count"])
	})

	t.Run("RecordTurnOutput records count but omits turn.output when empty", func(t *testing.T) {
		_, span := recorder.StartTurn(ctx, 0, "agent-a", "agent")
		recorder.RecordTurnOutput(span, "", 1)
		mockSpan := span.(*telemetrymock.MockSpan)
		assert.Equal(t, 1, mockSpan.Attributes["turn.output_message_count"])
		_, hasOutput := mockSpan.Attributes["turn.output"]
		assert.False(t, hasOutput)
	})

	t.Run("RecordTokenUsage sets token attributes", func(t *testing.T) {
		_, span := recorder.StartTurn(ctx, 0, "agent-a", "agent")
		recorder.RecordTokenUsage(span, 10, 20, 30)
		mockSpan := span.(*telemetrymock.MockSpan)
		assert.Equal(t, int64(10), mockSpan.Attributes[telemetry.AttrTokensPrompt])
		assert.Equal(t, int64(20), mockSpan.Attributes[telemetry.AttrTokensCompletion])
		assert.Equal(t, int64(30), mockSpan.Attributes[telemetry.AttrTokensTotal])
	})
}
