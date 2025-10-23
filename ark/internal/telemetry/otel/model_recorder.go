/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"
	"encoding/json"

	"github.com/openai/openai-go"
	"mckinsey.com/ark/internal/telemetry"
)

type modelRecorder struct {
	tracer telemetry.Tracer
}

func NewModelRecorder(tracer telemetry.Tracer) telemetry.ModelRecorder {
	return &modelRecorder{
		tracer: tracer,
	}
}

func (r *modelRecorder) StartModelExecution(ctx context.Context, modelName, modelType string) (context.Context, telemetry.Span) {
	spanName := "llm." + modelName
	return r.tracer.Start(ctx, spanName,
		telemetry.WithSpanKind(telemetry.SpanKindLLM),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrModelName, modelName),
			telemetry.String(telemetry.AttrModelType, modelType),
			telemetry.String(telemetry.AttrComponentName, "model"),
			telemetry.String("type", telemetry.ObservationTypeGeneration),
			telemetry.String(telemetry.AttrLangfuseModel, modelName),
			telemetry.String(telemetry.AttrLangfuseType, modelType),
		),
	)
}

func (r *modelRecorder) RecordInput(span telemetry.Span, messages []string) {
	if len(messages) == 0 {
		return
	}
	messagesJSON, err := json.Marshal(messages)
	if err != nil {
		return
	}
	span.SetAttributes(
		telemetry.String(telemetry.AttrMessagesInput, string(messagesJSON)),
		telemetry.Int64(telemetry.AttrMessagesInputCount, int64(len(messages))),
	)
}

func (r *modelRecorder) RecordOutput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrMessagesOutput, content))
}

func (r *modelRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

func (r *modelRecorder) RecordModelDetails(span telemetry.Span, modelName, provider, modelType string) {
	span.SetAttributes(
		telemetry.String(telemetry.AttrModelName, modelName),
		telemetry.String(telemetry.AttrModelProvider, provider),
		telemetry.String(telemetry.AttrModelType, modelType),
		telemetry.String(telemetry.AttrLangfuseModel, modelName),
		telemetry.String(telemetry.AttrLangfuseProvider, provider),
		telemetry.String(telemetry.AttrLangfuseType, modelType),
	)
}

func (r *modelRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *modelRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}

func ConvertMessagesToStrings(messages []openai.ChatCompletionMessageParamUnion) []string {
	result := make([]string, len(messages))
	for i, msg := range messages {
		msgJSON, err := json.Marshal(msg)
		if err != nil {
			result[i] = ""
			continue
		}
		result[i] = string(msgJSON)
	}
	return result
}
