package genai

import (
	"context"
	"fmt"
	"net/http"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
)

type AzureProvider struct {
	Model        string
	BaseURL      string
	APIVersion   string
	APIKey       string
	Headers      map[string]string
	Properties   map[string]string
	outputSchema *runtime.RawExtension
	schemaName   string
}

func (ap *AzureProvider) SetOutputSchema(schema *runtime.RawExtension, schemaName string) {
	ap.outputSchema = schema
	ap.schemaName = schemaName
}

func (ap *AzureProvider) ChatCompletion(ctx context.Context, messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(ap.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	// Apply structured output schema if provided
	applyStructuredOutputToParams(ap.outputSchema, ap.schemaName, &params)

	client := ap.createClient(ctx)
	return client.Chat.Completions.New(ctx, params)
}

// prepareStreamParams prepares the parameters for streaming chat completion
func (ap *AzureProvider) prepareStreamParams(messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) openai.ChatCompletionNewParams {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
	}

	applyPropertiesToParams(ap.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	// Apply structured output schema if provided
	applyStructuredOutputToParams(ap.outputSchema, ap.schemaName, &params)

	return params
}

func (ap *AzureProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := ap.prepareStreamParams(messages, n, tools...)
	client := ap.createClient(ctx)
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var fullResponse *openai.ChatCompletion
	toolCallsMap := make(map[int64]*openai.ChatCompletionMessageToolCall)

	for stream.Next() {
		chunk := stream.Current()
		if err := streamFunc(&chunk); err != nil {
			return nil, err
		}

		// Use the same accumulation logic as OpenAIProvider
		accumulateStreamChunk(&chunk, &fullResponse, toolCallsMap)
	}

	// Add accumulated tool calls to the response in index order
	if len(toolCallsMap) > 0 && fullResponse != nil && len(fullResponse.Choices) > 0 {
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
			}
		}
		fullResponse.Choices[0].Message.ToolCalls = toolCalls
	}

	if err := stream.Err(); err != nil {
		return nil, err
	}

	// Ensure we have a valid response
	if fullResponse == nil {
		return nil, fmt.Errorf("streaming completed but no response was accumulated")
	}

	// Initialize usage if not present (streaming responses may not include usage)
	if fullResponse.Usage.TotalTokens == 0 {
		fullResponse.Usage = openai.CompletionUsage{
			PromptTokens:     0,
			CompletionTokens: 0,
			TotalTokens:      0,
		}
	}

	return fullResponse, nil
}

func (ap *AzureProvider) createClient(ctx context.Context) openai.Client {
	var httpClient *http.Client
	if IsProbeContext(ctx) {
		httpClient = common.NewHTTPClientWithoutTracing()
	} else {
		httpClient = common.NewHTTPClientWithLogging(ctx)
	}

	deploymentURL := fmt.Sprintf("%s/openai/deployments/%s", ap.BaseURL, ap.Model)
	options := []option.RequestOption{
		option.WithBaseURL(deploymentURL),
		option.WithHeader("api-key", ap.APIKey),
		option.WithAPIKey(ap.APIKey),
		option.WithHTTPClient(httpClient),
		option.WithQueryAdd("api-version", ap.APIVersion),
	}

	options = applyHeadersToOptions(ctx, ap.Headers, options, ap.Model)

	return openai.NewClient(options...)
}

func (ap *AzureProvider) BuildConfig() map[string]any {
	config := map[string]any{
		"baseUrl": ap.BaseURL,
	}
	if ap.APIVersion != "" {
		config["apiVersion"] = ap.APIVersion
	}
	if ap.APIKey != "" {
		config["apiKey"] = ap.APIKey
	}
	return config
}
