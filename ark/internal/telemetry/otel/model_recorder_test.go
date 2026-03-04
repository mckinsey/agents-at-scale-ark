package otel

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	telemetrymock "mckinsey.com/ark/internal/telemetry/mock"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestModelRecorderRecordInputWithProtocolMessages(t *testing.T) {
	tracer := telemetrymock.NewTracer()
	recorder := NewModelRecorder(tracer)
	_, span := tracer.Start(context.Background(), "test-input")

	recorder.RecordInput(span, []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart("hello"),
		}),
	})

	require.Len(t, tracer.Spans, 1)
	mockSpan := tracer.Spans[0]
	assert.Equal(t, "user", mockSpan.GetAttributeString("llm.input_messages.0.message.role"))
	assert.Equal(t, "hello", mockSpan.GetAttributeString("llm.input_messages.0.message.content"))
}

func TestModelRecorderRecordOutputWithProtocolMessage(t *testing.T) {
	tracer := telemetrymock.NewTracer()
	recorder := NewModelRecorder(tracer)
	_, span := tracer.Start(context.Background(), "test-output")

	recorder.RecordOutput(span, protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("done"),
	}))

	require.Len(t, tracer.Spans, 1)
	mockSpan := tracer.Spans[0]
	assert.Equal(t, "assistant", mockSpan.GetAttributeString("llm.output_messages.0.message.role"))
	assert.Equal(t, "done", mockSpan.GetAttributeString("llm.output_messages.0.message.content"))
}
