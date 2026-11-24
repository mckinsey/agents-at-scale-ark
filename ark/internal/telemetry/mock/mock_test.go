/* Copyright 2025. McKinsey & Company */

package mock

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMockTeamRecorder_RecordTurnOutput(t *testing.T) {
	r := NewTeamRecorder()
	_, span := r.StartTurn(context.Background(), 0, "agent-a", "agent")

	r.RecordTurnOutput(span, "I AM AGENT A", 2)

	mockSpan, ok := span.(*MockSpan)
	require.True(t, ok)
	assert.Equal(t, 2, mockSpan.GetAttribute("turn.output_message_count"))
	assert.Equal(t, "I AM AGENT A", mockSpan.GetAttribute("turn.output"))
}

func TestMockTeamRecorder_RecordTurnOutput_EmptyOmitsOutput(t *testing.T) {
	r := NewTeamRecorder()
	_, span := r.StartTurn(context.Background(), 0, "agent-a", "agent")

	r.RecordTurnOutput(span, "", 1)

	mockSpan := span.(*MockSpan)
	assert.Equal(t, 1, mockSpan.GetAttribute("turn.output_message_count"))
	assert.False(t, mockSpan.HasAttribute("turn.output"))
}
