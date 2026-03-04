package otel

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	telemetrymock "mckinsey.com/ark/internal/telemetry/mock"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestTeamRecorderRecordTurnOutputWithProtocolMessages(t *testing.T) {
	tracer := telemetrymock.NewTracer()
	recorder := NewTeamRecorder(tracer)
	_, span := tracer.Start(context.Background(), "turn")

	recorder.RecordTurnOutput(span, []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("agent output"),
		}),
	}, 1)

	require.Len(t, tracer.Spans, 1)
	mockSpan := tracer.Spans[0]
	assert.Equal(t, 1, mockSpan.GetAttribute("turn.output_message_count"))
	assert.Equal(t, "agent output", mockSpan.GetAttributeString("turn.output"))
}
