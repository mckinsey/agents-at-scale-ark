package genai

import (
	"context"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/telemetry"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type ChatCompletionProvider interface {
	ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
	ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error)
}

type ConfigProvider interface {
	BuildConfig() map[string]any
}

type Model struct {
	Model        string
	Type         string
	Properties   map[string]string
	Provider     ChatCompletionProvider
	OutputSchema *runtime.RawExtension
	SchemaName   string
}

// ChunkWithMetadata wraps an OpenAI chunk with ARK metadata
type ChunkWithMetadata struct {
	*openai.ChatCompletionChunk
	Ark map[string]interface{} `json:"ark,omitempty"`
}

func (m *Model) ChatCompletion(ctx context.Context, messages []Message, eventStream EventStreamInterface, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	if m.Provider == nil {
		return nil, nil
	}

	// Create telemetry span for all model calls
	tracer := telemetry.NewTraceContext()
	spanType := "llm.chat_completion"
	if eventStream != nil {
		spanType = "llm.chat_completion_stream"
	}
	ctx, span := tracer.StartSpan(ctx, spanType)
	defer span.End()

	// Set input and model details
	otelMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		otelMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}
	telemetry.SetLLMCompletionInput(span, otelMessages)
	telemetry.AddModelDetails(span, m.Model, m.Type, telemetry.ExtractProviderFromType(m.Type), m.Properties)

	var response *openai.ChatCompletion
	var err error

	// Use streaming if event stream is provided
	if eventStream != nil {
		response, err = m.Provider.ChatCompletionStream(ctx, messages, n, func(chunk *openai.ChatCompletionChunk) error {
			// Wrap chunk with ARK metadata
			chunkWithMeta := m.wrapChunkWithMetadata(ctx, chunk)
			return eventStream.StreamChunk(ctx, chunkWithMeta)
		}, tools...)
	} else {
		response, err = m.Provider.ChatCompletion(ctx, messages, n, tools...)
	}

	if err != nil {
		telemetry.RecordError(span, err)
		return nil, err
	}

	// Set output and token usage
	telemetry.SetLLMCompletionOutput(span, response)
	telemetry.AddLLMTokenUsage(span, response.Usage.PromptTokens, response.Usage.CompletionTokens, response.Usage.TotalTokens)
	telemetry.RecordSuccess(span)

	return response, nil
}

// wrapChunkWithMetadata adds ARK metadata to a streaming chunk
func (m *Model) wrapChunkWithMetadata(ctx context.Context, chunk *openai.ChatCompletionChunk) interface{} {
	// Get execution metadata from context
	metadata := GetExecutionMetadata(ctx)

	// Add query and session IDs
	if queryID := getQueryID(ctx); queryID != "" {
		metadata["query"] = queryID
	}
	if sessionID := getSessionID(ctx); sessionID != "" {
		metadata["session"] = sessionID
	}

	// Add model name if not already in metadata
	if _, exists := metadata["model"]; !exists {
		metadata["model"] = m.Model
	}

	// If no metadata, return chunk as-is for backward compatibility
	if len(metadata) == 0 {
		return chunk
	}

	// Create an anonymous struct that embeds the chunk and adds ark field
	// This creates a JSON structure with all chunk fields plus an "ark" field
	return struct {
		*openai.ChatCompletionChunk
		Ark map[string]interface{} `json:"ark,omitempty"`
	}{
		ChatCompletionChunk: chunk,
		Ark:                 metadata,
	}
}
