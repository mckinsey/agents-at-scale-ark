/* Copyright 2025. McKinsey & Company */

package otel

import (
	"context"
	"encoding/json"
	"fmt"

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

func (r *modelRecorder) StartModelProbe(ctx context.Context, modelName, modelNamespace string) (context.Context, telemetry.Span) {
	return r.tracer.Start(ctx, "model.probe",
		telemetry.WithSpanKind(telemetry.SpanKindLLM),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrModelName, modelName),
			telemetry.String(telemetry.AttrQueryNamespace, modelNamespace),
			telemetry.String(telemetry.AttrComponentName, "model"),
			telemetry.String("type", "probe"),
		),
	)
}

func (r *modelRecorder) RecordInput(span telemetry.Span, messages any) {
	if messages == nil {
		return
	}

	// For OpenInference/Phoenix compatibility, we need to set individual message attributes
	// Format: llm.input_messages.{index}.message.{role|content}
	switch msgs := messages.(type) {
	case []openai.ChatCompletionMessageParamUnion:
		for i, msg := range msgs {
			prefix := fmt.Sprintf("llm.input_messages.%d.message", i)
			recordMessage(span, msg, prefix)
		}
	default:
		// Fallback: just marshal to JSON string
		messagesJSON, err := json.Marshal(messages)
		if err != nil {
			return
		}
		span.SetAttributes(
			telemetry.String(telemetry.AttrMessagesInput, string(messagesJSON)),
		)
	}
}

func recordMessage(span telemetry.Span, msg openai.ChatCompletionMessageParamUnion, prefix string) {
	switch {
	case msg.OfSystem != nil:
		span.SetAttributes(
			telemetry.String(prefix+".role", "system"),
			telemetry.String(prefix+".content", msg.OfSystem.Content.OfString.Value),
		)
	case msg.OfUser != nil:
		span.SetAttributes(
			telemetry.String(prefix+".role", "user"),
			telemetry.String(prefix+".content", msg.OfUser.Content.OfString.Value),
		)
	case msg.OfAssistant != nil:
		recordAssistantMessage(span, msg.OfAssistant, prefix)
	case msg.OfTool != nil:
		span.SetAttributes(
			telemetry.String(prefix+".role", "tool"),
			telemetry.String(prefix+".content", msg.OfTool.Content.OfString.Value),
			telemetry.String(prefix+".tool_call_id", msg.OfTool.ToolCallID),
		)
	}
}

func recordAssistantMessage(span telemetry.Span, assistant *openai.ChatCompletionAssistantMessageParam, prefix string) {
	span.SetAttributes(
		telemetry.String(prefix+".role", "assistant"),
	)
	if assistant.Content.OfString.Value != "" {
		span.SetAttributes(telemetry.String(prefix+".content", assistant.Content.OfString.Value))
	}
	// Handle tool calls if present - record each tool call as structured data
	if len(assistant.ToolCalls) > 0 {
		for j, toolCall := range assistant.ToolCalls {
			tcPrefix := fmt.Sprintf("%s.tool_calls.%d", prefix, j)
			span.SetAttributes(
				telemetry.String(tcPrefix+".id", toolCall.ID),
				telemetry.String(tcPrefix+".type", string(toolCall.Type)),
				telemetry.String(tcPrefix+".function.name", toolCall.Function.Name),
				telemetry.String(tcPrefix+".function.arguments", toolCall.Function.Arguments),
			)
		}
	}
}

func (r *modelRecorder) RecordOutput(span telemetry.Span, output any) {
	if output == nil {
		return
	}

	switch out := output.(type) {
	case string:
		span.SetAttributes(telemetry.String(telemetry.AttrMessagesOutput, out))
	case openai.ChatCompletionMessage:
		prefix := "llm.output_messages.0.message"
		span.SetAttributes(telemetry.String(prefix+".role", "assistant"))

		if out.Content != "" {
			span.SetAttributes(telemetry.String(prefix+".content", out.Content))
		}

		if len(out.ToolCalls) > 0 {
			for j, toolCall := range out.ToolCalls {
				tcPrefix := fmt.Sprintf("%s.tool_calls.%d", prefix, j)
				span.SetAttributes(
					telemetry.String(tcPrefix+".id", toolCall.ID),
					telemetry.String(tcPrefix+".type", string(toolCall.Type)),
					telemetry.String(tcPrefix+".function.name", toolCall.Function.Name),
					telemetry.String(tcPrefix+".function.arguments", toolCall.Function.Arguments),
				)
			}
		}
	default:
		outputJSON, err := json.Marshal(output)
		if err != nil {
			return
		}
		span.SetAttributes(telemetry.String(telemetry.AttrMessagesOutput, string(outputJSON)))
	}
}

func (r *modelRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

func (r *modelRecorder) RecordModelDetails(span telemetry.Span, modelName, modelType string) {
	span.SetAttributes(
		telemetry.String(telemetry.AttrModelName, modelName),
		telemetry.String(telemetry.AttrModelType, modelType),
		telemetry.String(telemetry.AttrLangfuseModel, modelName),
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
