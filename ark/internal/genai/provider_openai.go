package genai

import (
	"context"
	"fmt"
	"net/http"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"github.com/openai/openai-go/shared/constant"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type OpenAIProvider struct {
	Model        string
	BaseURL      string
	APIKey       string
	Headers      map[string]string
	Properties   map[string]string
	outputSchema *runtime.RawExtension
	schemaName   string
}

func (op *OpenAIProvider) SetOutputSchema(schema *runtime.RawExtension, schemaName string) {
	op.outputSchema = schema
	op.schemaName = schemaName
}

func (op *OpenAIProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    op.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(op.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	// Apply structured output schema if provided
	applyStructuredOutputToParams(op.outputSchema, op.schemaName, &params)

	client := op.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

// accumulateStreamChunk processes a streaming chunk and accumulates content and tool calls.
// Per OpenAI specification (https://platform.openai.com/docs/guides/function-calling#streaming),
// tool calls in streaming responses are fragmented across multiple chunks:
// - First chunk contains: {index: 0, id: "call_123", type: "function", function: {name: "get_weather", arguments: ""}}
// - Subsequent chunks contain: {index: 0, function: {arguments: "{\"loc"}}
// - More chunks: {index: 0, function: {arguments: "ation\": \"Boston\"}"}}
// We must accumulate these fragments by index to reconstruct complete tool calls.
func accumulateStreamChunk(chunk *openai.ChatCompletionChunk, fullResponse **openai.ChatCompletion, toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall) {
	if *fullResponse == nil {
		*fullResponse = &openai.ChatCompletion{
			ID:      chunk.ID,
			Object:  "chat.completion",
			Created: chunk.Created,
			Model:   chunk.Model,
			Choices: []openai.ChatCompletionChoice{},
		}
	}

	if len(chunk.Choices) == 0 {
		return
	}

	choice := &chunk.Choices[0]

	if len((*fullResponse).Choices) == 0 {
		(*fullResponse).Choices = append((*fullResponse).Choices, openai.ChatCompletionChoice{
			Index:   choice.Index,
			Message: openai.ChatCompletionMessage{},
		})
	}

	// Accumulate role (usually comes in first chunk)
	if choice.Delta.Role != "" {
		(*fullResponse).Choices[0].Message.Role = constant.Assistant(choice.Delta.Role)
	}

	if choice.Delta.Content != "" {
		(*fullResponse).Choices[0].Message.Content += choice.Delta.Content
	}

	// Accumulate tool calls per OpenAI streaming specification
	for _, deltaToolCall := range choice.Delta.ToolCalls {
		if existingCall, exists := toolCallsMap[deltaToolCall.Index]; exists {
			// Subsequent chunks only contain argument fragments to concatenate
			if deltaToolCall.Function.Arguments != "" {
				existingCall.Function.Arguments += deltaToolCall.Function.Arguments
			}
		} else {
			// First chunk contains ID, type, and function name
			toolCallsMap[deltaToolCall.Index] = &openai.ChatCompletionMessageToolCall{
				ID:   deltaToolCall.ID,
				Type: constant.Function("function"),
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      deltaToolCall.Function.Name,
					Arguments: deltaToolCall.Function.Arguments,
				},
			}
		}
	}

	if choice.FinishReason != "" {
		(*fullResponse).Choices[0].FinishReason = choice.FinishReason
	}
}

// processToolCalls processes accumulated tool calls from streaming
func (op *OpenAIProvider) processToolCalls(toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall, fullResponse *openai.ChatCompletion, streamFunc func(*openai.ChatCompletionChunk) error) error {
	logf.Log.Info("Stream completed", "toolCallsMapSize", len(toolCallsMap))
	logf.Log.Info("Checking accumulated tool calls", "mapSize", len(toolCallsMap),
		"hasResponse", fullResponse != nil,
		"hasChoices", fullResponse != nil && len(fullResponse.Choices) > 0)

	// Early return if no tool calls to process
	if len(toolCallsMap) == 0 || fullResponse == nil || len(fullResponse.Choices) == 0 {
		return nil
	}

	logf.Log.Info("Accumulated tool calls from streaming", "count", len(toolCallsMap))

	// Find max index to iterate in order
	maxIndex := int64(-1)
	for idx := range toolCallsMap {
		if idx > maxIndex {
			maxIndex = idx
		}
	}

	// Build tool calls array in index order
	toolCalls := make([]openai.ChatCompletionMessageToolCall, 0, len(toolCallsMap))
	for i := int64(0); i <= maxIndex; i++ {
		if toolCall, exists := toolCallsMap[i]; exists {
			toolCalls = append(toolCalls, *toolCall)
			logf.Log.Info("Adding tool call", "index", i, "id", toolCall.ID, "name", toolCall.Function.Name)
		}
	}
	fullResponse.Choices[0].Message.ToolCalls = toolCalls
	logf.Log.Info("Set tool calls on response", "count", len(toolCalls))

	// Send final accumulated message if needed
	if streamFunc != nil && len(toolCalls) > 0 {
		return op.sendFinalToolCallChunk(fullResponse, toolCalls, streamFunc)
	}

	return nil
}

// sendFinalToolCallChunk sends the final chunk with accumulated tool calls
func (op *OpenAIProvider) sendFinalToolCallChunk(fullResponse *openai.ChatCompletion, toolCalls []openai.ChatCompletionMessageToolCall, streamFunc func(*openai.ChatCompletionChunk) error) error {
	finalChunk := &openai.ChatCompletionChunk{
		ID:      fullResponse.ID,
		Object:  "chat.completion.chunk",
		Created: fullResponse.Created,
		Model:   fullResponse.Model,
		Choices: []openai.ChatCompletionChunkChoice{
			{
				Index:        0,
				Delta:        openai.ChatCompletionChunkChoiceDelta{},
				FinishReason: fullResponse.Choices[0].FinishReason,
			},
		},
	}

	// Send complete accumulated message as final update
	// This is a special chunk that contains the full message with tool calls
	// It's marked with a special field so memory can handle it appropriately
	logf.Log.Info("Sending final accumulated message with tool calls", "toolCount", len(toolCalls))
	if err := streamFunc(finalChunk); err != nil {
		logf.Log.Error(err, "Failed to send final accumulated message")
		return err
	}
	return nil
}

// prepareStreamParams prepares the parameters for streaming chat completion
func (op *OpenAIProvider) prepareStreamParams(messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) openai.ChatCompletionNewParams {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    op.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
		StreamOptions: openai.ChatCompletionStreamOptionsParam{
			IncludeUsage: openai.Bool(true),
		},
	}

	applyPropertiesToParams(op.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	// Apply structured output schema if provided
	applyStructuredOutputToParams(op.outputSchema, op.schemaName, &params)

	return params
}

func (op *OpenAIProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	logf.Log.Info("OpenAIProvider.ChatCompletionStream called", "messageCount", len(messages), "toolCount", len(tools))

	params := op.prepareStreamParams(messages, n, tools...)

	client := op.createClient(ctx)
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var fullResponse *openai.ChatCompletion
	toolCallsMap := make(map[int64]*openai.ChatCompletionMessageToolCall)

	chunkCount := 0
	for stream.Next() {
		chunk := stream.Current()
		chunkCount++
		if err := streamFunc(&chunk); err != nil {
			return nil, err
		}

		accumulateStreamChunk(&chunk, &fullResponse, toolCallsMap)

		if chunk.Usage.TotalTokens > 0 {
			fullResponse.Usage = openai.CompletionUsage{
				PromptTokens:     chunk.Usage.PromptTokens,
				CompletionTokens: chunk.Usage.CompletionTokens,
				TotalTokens:      chunk.Usage.TotalTokens,
			}
		}
	}

	// Process accumulated tool calls
	if err := op.processToolCalls(toolCallsMap, fullResponse, streamFunc); err != nil {
		logf.Log.Error(err, "Failed to process tool calls")
	}

	if err := stream.Err(); err != nil {
		return nil, err
	}

	// Ensure we have a valid response
	if fullResponse == nil {
		return nil, fmt.Errorf("streaming completed but no response was accumulated")
	}

	return fullResponse, nil
}

func (op *OpenAIProvider) createClient(ctx context.Context) openai.Client {
	var httpClient *http.Client
	if IsProbeContext(ctx) {
		httpClient = common.NewHTTPClientWithoutTracing()
	} else {
		httpClient = common.NewHTTPClientWithLogging(ctx)
	}

	options := []option.RequestOption{
		option.WithBaseURL(op.BaseURL),
		option.WithAPIKey(op.APIKey),
		option.WithHTTPClient(httpClient),
	}

	options = applyHeadersToOptions(ctx, op.Headers, options, op.Model)

	return openai.NewClient(options...)
}

func (op *OpenAIProvider) BuildConfig() map[string]any {
	config := map[string]any{
		"baseUrl": op.BaseURL,
	}
	if op.APIKey != "" {
		config["apiKey"] = op.APIKey
	}
	return config
}
