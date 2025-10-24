package genai

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
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
	Model         string
	Type          string
	Properties    map[string]string
	Provider      ChatCompletionProvider
	OutputSchema  *runtime.RawExtension
	SchemaName    string
	ModelRecorder telemetry.ModelRecorder
}

func (m *Model) ChatCompletion(ctx context.Context, messages []Message, eventStream EventStreamInterface, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	if m.Provider == nil {
		return nil, nil
	}

	ctx, span := m.ModelRecorder.StartModelExecution(ctx, m.Model, m.Type)
	defer span.End()

	otelMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		otelMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	m.ModelRecorder.RecordInput(span, otelMessages)
	m.ModelRecorder.RecordModelDetails(span, m.Model, m.Type)

	if m.OutputSchema != nil {
		m.Provider.SetOutputSchema(m.OutputSchema, m.SchemaName)
	}

	var response *openai.ChatCompletion
	var err error

	if eventStream != nil {
		response, err = m.Provider.ChatCompletionStream(ctx, messages, n, func(chunk *openai.ChatCompletionChunk) error {
			chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, m.Model)
			return eventStream.StreamChunk(ctx, chunkWithMeta)
		}, tools...)
	} else {
		response, err = m.Provider.ChatCompletion(ctx, messages, n, tools...)
	}

	if err != nil {
		m.ModelRecorder.RecordError(span, err)
		return nil, err
	}

	if response == nil {
		err := fmt.Errorf("model provider returned nil response without error")
		m.ModelRecorder.RecordError(span, err)
		return nil, err
	}

	if len(response.Choices) > 0 {
		m.ModelRecorder.RecordOutput(span, response.Choices[0].Message)
	}

	m.ModelRecorder.RecordTokenUsage(span, response.Usage.PromptTokens, response.Usage.CompletionTokens, response.Usage.TotalTokens)
	m.ModelRecorder.RecordSuccess(span)

	return response, nil
}
