package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

type ChatCompletionProvider interface {
	ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
	ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
	SetOutputSchema(schema *runtime.RawExtension, schemaName string)
}

type ConfigProvider interface {
	BuildConfig() map[string]any
}

type Model struct {
	Model             string
	Type              string
	Properties        map[string]string
	Provider          ChatCompletionProvider
	OutputSchema      *runtime.RawExtension
	SchemaName        string
	telemetryRecorder telemetry.ModelRecorder
	eventingRecorder  eventing.ModelRecorder
}

func (m *Model) ChatCompletion(ctx context.Context, messages []Message, eventStream EventStreamInterface, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	if m.Provider == nil {
		return nil, nil
	}

	ctx, span := m.telemetryRecorder.StartModelExecution(ctx, m.Model, m.Type)
	defer span.End()

	operationData := map[string]string{
		"model":     m.Model,
		"modelType": m.Type,
	}
	ctx = m.eventingRecorder.Start(ctx, "LLMCall", fmt.Sprintf("Calling model %s", m.Model), operationData)

	otelMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		otelMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	m.telemetryRecorder.RecordInput(span, otelMessages)
	m.telemetryRecorder.RecordModelDetails(span, m.Model, m.Type)

	if m.OutputSchema != nil {
		m.Provider.SetOutputSchema(m.OutputSchema, m.SchemaName)
	}

	var response *openai.ChatCompletion
	var err error

	if eventStream != nil {
		response, err = m.Provider.ChatCompletionStream(ctx, messages, n, func(chunk *openai.ChatCompletionChunk) error {
			chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, m.Model, nil)
			return eventStream.StreamChunk(ctx, chunkWithMeta)
		}, tools...)
	} else {
		response, err = m.Provider.ChatCompletion(ctx, messages, n, tools...)
	}

	if err != nil {
		m.telemetryRecorder.RecordError(span, err)
		m.eventingRecorder.Fail(ctx, "LLMCall", fmt.Sprintf("Model call failed: %v", err), err, operationData)
		return nil, err
	}

	if response == nil {
		err := fmt.Errorf("model provider returned nil response without error")
		m.telemetryRecorder.RecordError(span, err)
		m.eventingRecorder.Fail(ctx, "LLMCall", "Model returned nil response", err, operationData)
		return nil, err
	}

	if len(response.Choices) > 0 {
		m.telemetryRecorder.RecordOutput(span, response.Choices[0].Message)
	}

	m.telemetryRecorder.RecordTokenUsage(span, response.Usage.PromptTokens, response.Usage.CompletionTokens, response.Usage.TotalTokens)
	m.telemetryRecorder.RecordSuccess(span)
	m.eventingRecorder.Complete(ctx, "LLMCall", "Model call completed successfully", operationData)
	m.eventingRecorder.AddTokenUsage(ctx, arkv1alpha1.TokenUsage{
		PromptTokens:     response.Usage.PromptTokens,
		CompletionTokens: response.Usage.CompletionTokens,
		TotalTokens:      response.Usage.TotalTokens,
	})

	return response, nil
}
