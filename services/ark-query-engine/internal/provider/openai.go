package provider

import (
	"context"
	"fmt"
	"net/http"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type OpenAIProvider struct {
	Model      string
	BaseURL    string
	APIKey     string
	Headers    map[string]string
	Properties map[string]string
}

func (op *OpenAIProvider) Turn(ctx context.Context, messages []a2aprotocol.Message, toolOutcomes []ToolOutcome, tools []ToolDefinition, streamHandler StreamChunkHandler) (*TurnResult, error) {
	compatMessages, err := convertA2AMessagesToOpenAI(messages)
	if err != nil {
		return nil, fmt.Errorf("openai turn: failed to convert messages: %w", err)
	}
	compatMessages = normalizeToolCallMessages(compatMessages, buildToolOutcomeMap(toolOutcomes))
	openAITools := toolDefsToOpenAI(tools)

	var response *openai.ChatCompletion
	if streamHandler != nil {
		response, err = op.chatCompletionStream(ctx, compatMessages, openAITools, streamHandler)
	} else {
		response, err = op.chatCompletion(ctx, compatMessages, openAITools)
	}
	if err != nil {
		return nil, err
	}
	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("openai turn: model returned empty response")
	}
	result, err := buildTurnResultFromChoice(response.Choices[0])
	if err != nil {
		return nil, err
	}
	result.Usage = &TurnUsage{
		PromptTokens:     response.Usage.PromptTokens,
		CompletionTokens: response.Usage.CompletionTokens,
		TotalTokens:      response.Usage.TotalTokens,
	}
	return result, nil
}

func (op *OpenAIProvider) chatCompletion(ctx context.Context, messages []openai.ChatCompletionMessageParamUnion, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := openai.ChatCompletionNewParams{
		Model:    op.Model,
		Messages: messages,
		N:        openai.Int(1),
	}
	if len(tools) > 0 {
		params.Tools = tools
	}
	applyProperties(op.Properties, &params)
	client := op.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

func (op *OpenAIProvider) chatCompletionStream(ctx context.Context, messages []openai.ChatCompletionMessageParamUnion, tools []openai.ChatCompletionToolParam, streamHandler StreamChunkHandler) (*openai.ChatCompletion, error) {
	params := openai.ChatCompletionNewParams{
		Model:    op.Model,
		Messages: messages,
		N:        openai.Int(1),
		StreamOptions: openai.ChatCompletionStreamOptionsParam{
			IncludeUsage: openai.Bool(true),
		},
	}
	if len(tools) > 0 {
		params.Tools = tools
	}
	applyProperties(op.Properties, &params)

	client := op.createClient(ctx)
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var fullResponse *openai.ChatCompletion
	toolCallsMap := make(map[int64]*openai.ChatCompletionMessageToolCall)

	for stream.Next() {
		chunk := stream.Current()
		if streamHandler != nil {
			if err := streamHandler(&chunk); err != nil {
				return nil, err
			}
		}
		accumulateChunk(&chunk, &fullResponse, toolCallsMap)
		if chunk.Usage.TotalTokens > 0 && fullResponse != nil {
			fullResponse.Usage = openai.CompletionUsage{
				PromptTokens:     chunk.Usage.PromptTokens,
				CompletionTokens: chunk.Usage.CompletionTokens,
				TotalTokens:      chunk.Usage.TotalTokens,
			}
		}
	}

	finalizeToolCalls(toolCallsMap, fullResponse)

	if err := stream.Err(); err != nil {
		return nil, err
	}
	if fullResponse == nil {
		return nil, fmt.Errorf("streaming completed but no response was accumulated")
	}
	return fullResponse, nil
}

func (op *OpenAIProvider) createClient(_ context.Context) openai.Client {
	options := []option.RequestOption{
		option.WithBaseURL(op.BaseURL),
		option.WithAPIKey(op.APIKey),
		option.WithHTTPClient(http.DefaultClient),
	}
	for name, value := range op.Headers {
		options = append(options, option.WithHeader(name, value))
	}
	return openai.NewClient(options...)
}
