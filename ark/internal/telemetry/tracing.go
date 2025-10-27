package telemetry

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/baggage"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	TracerName    = "ark/controller"
	ServiceName   = "ark"
	ComponentName = "ark-controller"
)

var targetToObservationType = map[string]string{
	"agent": "agent",
	"model": "generation",
	"tool":  "tool",
}

type TraceContext struct {
	tracer trace.Tracer
}

func NewTraceContext() *TraceContext {
	return &TraceContext{
		tracer: otel.Tracer(TracerName),
	}
}

func (tc *TraceContext) StartSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	// Add ARK tagging to all spans
	arkAttrs := []attribute.KeyValue{
		attribute.String("service.name", ServiceName),
		attribute.String("component", ComponentName),
	}
	arkAttrs = append(arkAttrs, attrs...)
	return tc.tracer.Start(ctx, name, trace.WithAttributes(arkAttrs...))
}

func (tc *TraceContext) StartQuerySpan(ctx context.Context, queryName, queryNamespace, phase string) (context.Context, trace.Span) {
	return tc.StartSpan(ctx, "query."+phase,
		attribute.String("query.name", queryName),
		attribute.String("query.namespace", queryNamespace),
		attribute.String("query.phase", phase),
	)
}

func (tc *TraceContext) StartTargetSpan(ctx context.Context, targetType, targetName string) (context.Context, trace.Span) {
	spanName := fmt.Sprintf("query.%s", targetType)

	attrs := []attribute.KeyValue{
		attribute.String("target.type", targetType),
		attribute.String("target.name", targetName),
	}

	if obsType, ok := targetToObservationType[targetType]; ok {
		attrs = append(attrs, attribute.String("type", obsType))
	}

	return tc.StartSpan(ctx, spanName, attrs...)
}

func (tc *TraceContext) StartAgentSpan(ctx context.Context, agentName, modelName string) (context.Context, trace.Span) {
	return tc.StartSpan(ctx, "agent.execute",
		attribute.String("agent.name", agentName),
		attribute.String("model.name", modelName),
		// Langfuse observation type for agents
		attribute.String("type", "agent"),
	)
}

func (tc *TraceContext) StartModelSpan(ctx context.Context, modelName, provider string) (context.Context, trace.Span) {
	return tc.StartSpan(ctx, "model.execute",
		attribute.String("model.name", modelName),
		attribute.String("model.provider", provider),
		// Langfuse observation type for LLM generations
		attribute.String("type", "generation"),
	)
}

func (tc *TraceContext) StartEvaluationSpan(ctx context.Context, evaluatorName string) (context.Context, trace.Span) {
	return tc.StartSpan(ctx, "evaluation.execute",
		attribute.String("evaluator.name", evaluatorName),
	)
}

func RecordError(span trace.Span, err error) {
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
}

func RecordSuccess(span trace.Span) {
	span.SetStatus(codes.Ok, "success")
}

func AddTokenUsage(span trace.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		attribute.Int64("tokens.prompt", promptTokens),
		attribute.Int64("tokens.completion", completionTokens),
		attribute.Int64("tokens.total", totalTokens),
	)
}

func AddEvaluationResult(span trace.Span, score float64, passed bool) {
	span.SetAttributes(
		attribute.Float64("evaluation.score", score),
		attribute.Bool("evaluation.passed", passed),
	)
}

func AddObjectRef(span trace.Span, obj metav1.Object) {
	span.SetAttributes(
		attribute.String("resource.name", obj.GetName()),
		attribute.String("resource.namespace", obj.GetNamespace()),
		attribute.String("resource.uid", string(obj.GetUID())),
	)
}

func AddChatCompletion(span trace.Span, inputMessages []string, outputContent, finishReason string) {
	// Use Langfuse-expected attribute names for OTLP traces
	span.SetAttributes(
		attribute.String("gen_ai.completion.finish_reason", finishReason),
		attribute.Int("messages.input_count", len(inputMessages)),
	)

	// Set input using Langfuse OTLP attribute names
	if len(inputMessages) > 0 {
		lastMessage := inputMessages[len(inputMessages)-1]
		if len(lastMessage) > 500 {
			lastMessage = lastMessage[:500] + "..."
		}
		span.SetAttributes(
			attribute.String("input.value", lastMessage),
		)
	}

	// Set output using Langfuse OTLP attribute names
	if outputContent != "" {
		span.SetAttributes(
			attribute.String("output.value", outputContent),
		)
	}
}

func AddModelDetails(span trace.Span, modelName, modelType, provider string, properties map[string]string) {
	// Standard LLM observability attributes for cost calculation and analytics
	span.SetAttributes(
		// Model identification (required for cost calculation)
		attribute.String("llm.model.name", modelName),
		attribute.String("llm.model.provider", provider),
		attribute.String("llm.model.type", modelType),

		// OpenTelemetry semantic conventions for GenAI
		attribute.String("gen_ai.system", provider),
		attribute.String("gen_ai.request.model", modelName),

		// Langfuse-specific attributes
		attribute.String("model", modelName),
		attribute.String("provider", provider),
	)

	// Add model properties as additional attributes
	for key, value := range properties {
		span.SetAttributes(attribute.String(fmt.Sprintf("llm.model.%s", key), value))
	}
}

func AddLLMTokenUsage(span trace.Span, promptTokens, completionTokens, totalTokens int64) {
	// Enhanced token usage with OpenTelemetry GenAI semantic conventions
	span.SetAttributes(
		// Standard token usage
		attribute.Int64("tokens.prompt", promptTokens),
		attribute.Int64("tokens.completion", completionTokens),
		attribute.Int64("tokens.total", totalTokens),

		// OpenTelemetry GenAI semantic conventions
		attribute.Int64("gen_ai.usage.input_tokens", promptTokens),
		attribute.Int64("gen_ai.usage.output_tokens", completionTokens),
		attribute.Int64("gen_ai.usage.total_tokens", totalTokens),

		// Langfuse-specific attributes
		attribute.Int64("usage.input_tokens", promptTokens),
		attribute.Int64("usage.output_tokens", completionTokens),
		attribute.Int64("usage.total_tokens", totalTokens),
	)
}

// ExtractMessageContentForTelemetry extracts content from OpenAI union message types for telemetry
func ExtractMessageContentForTelemetry(msg openai.ChatCompletionMessageParamUnion) string {
	// Handle different message types in the union
	switch {
	case msg.OfUser != nil:
		if content := msg.OfUser.Content; content.OfString.Value != "" {
			return content.OfString.Value
		}
	case msg.OfAssistant != nil:
		if content := msg.OfAssistant.Content; content.OfString.Value != "" {
			return content.OfString.Value
		}
	case msg.OfSystem != nil:
		if content := msg.OfSystem.Content; content.OfString.Value != "" {
			return content.OfString.Value
		}
	case msg.OfTool != nil:
		if content := msg.OfTool.Content; content.OfString.Value != "" {
			return content.OfString.Value
		}
	}

	// Fallback to empty string for telemetry
	return ""
}

// ExtractProviderFromType extracts provider name from model type for telemetry
func ExtractProviderFromType(modelType string) string {
	switch modelType {
	case "openai", "openai-compatible":
		return "openai"
	case "azure-openai":
		return "azure"
	case "bedrock":
		return "aws"
	default:
		return modelType
	}
}

// SetLLMCompletionInput sets input attributes on LLM completion span with full conversation
func SetLLMCompletionInput(span trace.Span, messages []openai.ChatCompletionMessageParamUnion) {
	if len(messages) > 0 {
		// Extract content strings from messages for detailed telemetry
		var messageContents []map[string]string

		for _, msg := range messages {
			content := ExtractMessageContentForTelemetry(msg)
			role := ""

			switch {
			case msg.OfUser != nil:
				role = "user"
			case msg.OfAssistant != nil:
				role = "assistant"
			case msg.OfSystem != nil:
				role = "system"
			case msg.OfTool != nil:
				role = "tool"
			}

			if content != "" && role != "" {
				messageContents = append(messageContents, map[string]string{
					"role":    role,
					"content": content,
				})
			}
		}

		conversationJSON, err := json.Marshal(messageContents)
		if err == nil {
			span.SetAttributes(attribute.String("input.value", string(conversationJSON)))
		}

		span.SetAttributes(attribute.Int("gen_ai.request.messages.count", len(messages)))
	}
}

// SetLLMCompletionOutput sets output attributes on LLM completion span
func SetLLMCompletionOutput(span trace.Span, response *openai.ChatCompletion) {
	if len(response.Choices) > 0 {
		choice := response.Choices[0]
		span.SetAttributes(
			attribute.String("output.value", choice.Message.Content),
			attribute.String("gen_ai.completion.finish_reason", choice.FinishReason),
		)

		if len(choice.Message.ToolCalls) > 0 {
			span.SetAttributes(
				attribute.Int("tools.called", len(choice.Message.ToolCalls)),
				attribute.String("tools.functions", choice.Message.ToolCalls[0].Function.Name),
			)
		}
	}
}

// SetToolInput sets input attributes on tool execution span
func SetToolInput(span trace.Span, toolCallID, input string) {
	if toolCallID != "" {
		span.SetAttributes(attribute.String("gen_ai.tool.call.id", toolCallID))
	}
	if input != "" {
		span.SetAttributes(attribute.String("input.value", input))
	}
}

// SetToolOutput sets output attributes on tool execution span
func SetToolOutput(span trace.Span, output string) {
	if output != "" {
		span.SetAttributes(attribute.String("output.value", output))
	}
}

// SetToolDescription sets description attribute on tool execution span
func SetToolDescription(span trace.Span, description string) {
	if description != "" {
		span.SetAttributes(attribute.String("gen_ai.tool.description", description))
	}
}

// SetQueryInput sets input attribute on query span with user message content
func SetQueryInput(span trace.Span, userContent string) {
	if userContent != "" {
		span.SetAttributes(attribute.String("input.value", userContent))
	}
}

// StartToolExecution starts a tool execution span with OTEL and Langfuse attributes
func StartToolExecution(ctx context.Context, toolName, toolType, toolCallID, input string) (context.Context, trace.Span) {
	spanName := fmt.Sprintf("execute_tool %s", toolName)
	tracer := otel.Tracer(TracerName)

	ctx, span := tracer.Start(ctx, spanName,
		trace.WithAttributes(
			attribute.String("service.name", ServiceName),
			attribute.String("component", ComponentName),
			attribute.String("gen_ai.operation.name", "execute_tool"),
			attribute.String("gen_ai.tool.name", toolName),
			attribute.String("gen_ai.tool.type", toolType),
			attribute.String("type", "tool"),
		),
	)

	if toolCallID != "" {
		span.SetAttributes(attribute.String("gen_ai.tool.call.id", toolCallID))
	}
	if input != "" {
		span.SetAttributes(attribute.String("input.value", input))
	}

	return ctx, span
}

// RecordToolSuccess records successful tool execution with output
func RecordToolSuccess(span trace.Span, output string) {
	if output != "" {
		span.SetAttributes(attribute.String("output.value", output))
	}
	RecordSuccess(span)
}

// RecordToolError records tool execution failure
func RecordToolError(span trace.Span, err error) {
	RecordError(span, err)
}

// Session tracking functions

// StartSessionContext creates a new context with session tracking via OTEL baggage
func StartSessionContext(ctx context.Context, sessionID string) context.Context {
	// Add session ID to baggage for propagation across all traces/spans
	bag := baggage.FromContext(ctx)
	member, _ := baggage.NewMember("session.id", sessionID)
	bag, _ = bag.SetMember(member)
	return baggage.ContextWithBaggage(ctx, bag)
}

// GetSessionID extracts session ID from context baggage
func GetSessionID(ctx context.Context) string {
	bag := baggage.FromContext(ctx)
	return bag.Member("session.id").Value()
}

// StartQuery creates a query span with session context
func (tc *TraceContext) StartQuery(ctx context.Context, queryName, queryNamespace, phase, sessionID string) (context.Context, trace.Span) {
	// Set session in baggage if not already present
	if GetSessionID(ctx) == "" && sessionID != "" {
		ctx = StartSessionContext(ctx, sessionID)
	}

	// Start query span with session attribute
	ctx, span := tc.StartQuerySpan(ctx, queryName, queryNamespace, phase)

	// Add session ID as span attribute for filtering
	if sid := GetSessionID(ctx); sid != "" {
		span.SetAttributes(attribute.String("session.id", sid))
	}

	return ctx, span
}

// InjectOTELHeaders injects OTEL trace context and session info into HTTP headers
func InjectOTELHeaders(ctx context.Context, headers map[string]string) {
	// Inject standard W3C trace context headers
	carrier := propagation.MapCarrier(headers)
	otel.GetTextMapPropagator().Inject(ctx, carrier)

	// Add session ID as custom header for A2A servers
	if sessionID := GetSessionID(ctx); sessionID != "" {
		headers["X-Session-ID"] = sessionID
	}
}

// GenerateSessionID creates a session identifier from query metadata
func GenerateSessionID(queryName, queryNamespace string, customSessionID *string) string {
	if customSessionID != nil {
		return *customSessionID
	}
	// Default: namespace-queryname format
	return fmt.Sprintf("%s-%s", queryNamespace, queryName)
}
