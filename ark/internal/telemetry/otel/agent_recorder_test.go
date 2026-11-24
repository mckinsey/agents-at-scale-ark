/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"mckinsey.com/ark/internal/telemetry"
	telemetrymock "mckinsey.com/ark/internal/telemetry/mock"
)

func TestAgentRecorder(t *testing.T) {
	tracer := telemetrymock.NewTracer()
	recorder := NewAgentRecorder(tracer)
	ctx := context.Background()

	t.Run("StartAgentExecution names span with namespace and agent", func(t *testing.T) {
		_, span := recorder.StartAgentExecution(ctx, "deploy-agent", "default")
		require.NotNil(t, span)
		mockSpan, ok := span.(*telemetrymock.MockSpan)
		require.True(t, ok)
		assert.Equal(t, "agent.default/deploy-agent", mockSpan.Name)
	})

	t.Run("StartLLMCall produces llm.call span", func(t *testing.T) {
		_, span := recorder.StartLLMCall(ctx, "gpt-4o")
		mockSpan, ok := span.(*telemetrymock.MockSpan)
		require.True(t, ok)
		assert.Equal(t, "llm.call", mockSpan.Name)
	})

	t.Run("StartToolCall produces tool.execution span", func(t *testing.T) {
		_, span := recorder.StartToolCall(ctx, "deploy", "http", "tool-1", `{"env":"prod"}`)
		mockSpan, ok := span.(*telemetrymock.MockSpan)
		require.True(t, ok)
		assert.Equal(t, "tool.execution", mockSpan.Name)
	})

	t.Run("RecordToolResult sets output attribute", func(t *testing.T) {
		_, span := recorder.StartToolCall(ctx, "deploy", "http", "tool-1", "{}")
		recorder.RecordToolResult(span, "ok")
		mockSpan := span.(*telemetrymock.MockSpan)
		assert.Equal(t, "ok", mockSpan.Attributes[telemetry.AttrToolOutput])
	})

	t.Run("RecordTokenUsage sets prompt, completion, total attributes", func(t *testing.T) {
		_, span := recorder.StartLLMCall(ctx, "gpt-4o")
		recorder.RecordTokenUsage(span, 10, 20, 30)
		mockSpan := span.(*telemetrymock.MockSpan)
		assert.Equal(t, int64(10), mockSpan.Attributes[telemetry.AttrTokensPrompt])
		assert.Equal(t, int64(20), mockSpan.Attributes[telemetry.AttrTokensCompletion])
		assert.Equal(t, int64(30), mockSpan.Attributes[telemetry.AttrTokensTotal])
	})

	t.Run("RecordSuccess marks span StatusOk", func(t *testing.T) {
		_, span := recorder.StartAgentExecution(ctx, "a", "default")
		recorder.RecordSuccess(span)
		mockSpan := span.(*telemetrymock.MockSpan)
		assert.Equal(t, telemetry.StatusOk, mockSpan.Status)
	})

	t.Run("RecordError attaches the error", func(t *testing.T) {
		_, span := recorder.StartToolCall(ctx, "deploy", "http", "tool-1", "{}")
		recorder.RecordError(span, errors.New("boom"))
		mockSpan := span.(*telemetrymock.MockSpan)
		require.Len(t, mockSpan.Errors, 1)
		assert.Equal(t, "boom", mockSpan.Errors[0].Error())
	})
}
