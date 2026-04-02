package completions

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/common"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type AzureManagedIdentityConfig struct {
	ClientID string
}

type AzureWorkloadIdentityConfig struct {
	ClientID string
	TenantID string
}

type AzureProvider struct {
	Model            string
	BaseURL          string
	APIVersion       string
	APIKey           string
	ManagedIdentity  *AzureManagedIdentityConfig
	WorkloadIdentity *AzureWorkloadIdentityConfig
	Headers          map[string]string
	Properties       map[string]string
	outputSchema     *runtime.RawExtension
	schemaName       string
}

func (ap *AzureProvider) SetOutputSchema(schema *runtime.RawExtension, schemaName string) {
	ap.outputSchema = schema
	ap.schemaName = schemaName
}

func (ap *AzureProvider) getCredential() (azcore.TokenCredential, error) {
	if ap.ManagedIdentity != nil {
		if ap.ManagedIdentity.ClientID == "" {
			return azidentity.NewManagedIdentityCredential(nil)
		}
		return azidentity.NewManagedIdentityCredential(&azidentity.ManagedIdentityCredentialOptions{
			ID: azidentity.ClientID(ap.ManagedIdentity.ClientID),
		})
	}

	if ap.WorkloadIdentity != nil {
		return azidentity.NewWorkloadIdentityCredential(&azidentity.WorkloadIdentityCredentialOptions{
			ClientID: ap.WorkloadIdentity.ClientID,
			TenantID: ap.WorkloadIdentity.TenantID,
		})
	}

	return nil, fmt.Errorf("no identity configuration found")
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

	applyStructuredOutputToParams(ap.outputSchema, ap.schemaName, &params)

	client, err := ap.createClient(ctx)
	if err != nil {
		return nil, err
	}
	return client.Chat.Completions.New(ctx, params)
}

func (ap *AzureProvider) prepareStreamParams(messages []Message, n int64, tools ...[]openai.ChatCompletionToolParam) openai.ChatCompletionNewParams {
	openaiMessages := make([]openai.ChatCompletionMessageParamUnion, len(messages))
	for i, msg := range messages {
		openaiMessages[i] = openai.ChatCompletionMessageParamUnion(msg)
	}

	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: openaiMessages,
		N:        openai.Int(n),
		StreamOptions: openai.ChatCompletionStreamOptionsParam{
			IncludeUsage: openai.Bool(true),
		},
	}

	applyPropertiesToParams(ap.Properties, &params)

	if len(tools) > 0 && len(tools[0]) > 0 {
		params.Tools = tools[0]
	}

	applyStructuredOutputToParams(ap.outputSchema, ap.schemaName, &params)

	return params
}

func (ap *AzureProvider) ChatCompletionStream(ctx context.Context, messages []Message, n int64, streamFunc func(*openai.ChatCompletionChunk) error, tools ...[]openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := ap.prepareStreamParams(messages, n, tools...)
	client, err := ap.createClient(ctx)
	if err != nil {
		return nil, err
	}
	stream := client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var fullResponse *openai.ChatCompletion
	toolCallsMap := make(map[int64]*openai.ChatCompletionMessageToolCall)

	for stream.Next() {
		chunk := stream.Current()
		if err := streamFunc(&chunk); err != nil {
			return nil, err
		}

		accumulateStreamChunk(&chunk, &fullResponse, toolCallsMap)

		// Accumulate usage if present in chunk
		if chunk.Usage.TotalTokens > 0 {
			fullResponse.Usage = openai.CompletionUsage{
				PromptTokens:     chunk.Usage.PromptTokens,
				CompletionTokens: chunk.Usage.CompletionTokens,
				TotalTokens:      chunk.Usage.TotalTokens,
			}
		}
	}

	ap.finalizeToolCalls(fullResponse, toolCallsMap, streamFunc)

	if err := stream.Err(); err != nil {
		return nil, err
	}

	if fullResponse == nil {
		return nil, fmt.Errorf("streaming completed but no response was accumulated")
	}

	ap.ensureUsageData(fullResponse)

	return fullResponse, nil
}

// finalizeToolCalls assembles and sends final tool calls from the tool calls map
func (ap *AzureProvider) finalizeToolCalls(fullResponse *openai.ChatCompletion, toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall, streamFunc func(*openai.ChatCompletionChunk) error) {
	if len(toolCallsMap) == 0 || fullResponse == nil || len(fullResponse.Choices) == 0 {
		return
	}

	maxIndex := int64(-1)
	for idx := range toolCallsMap {
		if idx > maxIndex {
			maxIndex = idx
		}
	}

	toolCalls := make([]openai.ChatCompletionMessageToolCall, 0, len(toolCallsMap))
	for i := int64(0); i <= maxIndex; i++ {
		if toolCall, exists := toolCallsMap[i]; exists {
			toolCalls = append(toolCalls, *toolCall)
		}
	}
	fullResponse.Choices[0].Message.ToolCalls = toolCalls

	// Send final chunk with tool calls in delta for frontend visibility
	if err := SendFinalToolCallChunk(fullResponse, toolCalls, streamFunc); err != nil {
		logf.Log.Error(err, "Failed to send final tool call chunk")
	}
}

// ensureUsageData ensures the response has usage data
func (ap *AzureProvider) ensureUsageData(fullResponse *openai.ChatCompletion) {
	if fullResponse.Usage.TotalTokens == 0 {
		fullResponse.Usage = openai.CompletionUsage{
			PromptTokens:     0,
			CompletionTokens: 0,
			TotalTokens:      0,
		}
	}
}

func (ap *AzureProvider) createClient(ctx context.Context) (openai.Client, error) {
	var httpClient *http.Client
	if IsProbeContext(ctx) {
		httpClient = common.NewHTTPClientWithoutTracing()
	} else {
		httpClient = common.NewHTTPClientWithLogging(ctx)
	}

	deploymentURL := fmt.Sprintf("%s/openai/deployments/%s", ap.BaseURL, ap.Model)
	options := []option.RequestOption{
		option.WithBaseURL(deploymentURL),
		option.WithHTTPClient(httpClient),
		option.WithQueryAdd("api-version", ap.APIVersion),
	}

	if ap.ManagedIdentity != nil || ap.WorkloadIdentity != nil {
		cred, err := ap.getCredential()
		if err != nil {
			var zero openai.Client
			return zero, fmt.Errorf("azure identity credential: %w", err)
		}
		tokenResp, err := cred.GetToken(ctx, policy.TokenRequestOptions{
			Scopes: []string{"https://cognitiveservices.azure.com/.default"},
		})
		if err != nil {
			var zero openai.Client
			return zero, fmt.Errorf("azure identity get token: %w", err)
		}
		options = append(options, option.WithHeader("Authorization", fmt.Sprintf("Bearer %s", tokenResp.Token)))
	} else {
		options = append(options,
			option.WithHeader("api-key", ap.APIKey),
			option.WithAPIKey(ap.APIKey),
		)
	}

	options = applyHeadersToOptions(ctx, ap.Headers, options, ap.Model)

	return openai.NewClient(options...), nil
}

func (ap *AzureProvider) HealthCheck(ctx context.Context) error {
	testMessages := []Message{NewUserMessage("test")}
	_, err := ap.ChatCompletion(ctx, testMessages, 1)
	return err
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
