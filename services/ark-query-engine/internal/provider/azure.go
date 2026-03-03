package provider

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	a2aprotocol "trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type AzureProvider struct {
	Model            string
	BaseURL          string
	APIVersion       string
	APIKey           string
	ManagedIdentity  *AzureManagedIdentityConfig
	WorkloadIdentity *AzureWorkloadIdentityConfig
	Headers          map[string]string
	Properties       map[string]string
}

type AzureManagedIdentityConfig struct {
	ClientID string
}

type AzureWorkloadIdentityConfig struct {
	ClientID string
	TenantID string
}

func (ap *AzureProvider) Turn(ctx context.Context, messages []a2aprotocol.Message, toolOutcomes []ToolOutcome, tools []ToolDefinition, streamHandler StreamChunkHandler) (*TurnResult, error) {
	compatMessages, err := convertA2AMessagesToOpenAI(messages)
	if err != nil {
		return nil, fmt.Errorf("azure turn: failed to convert messages: %w", err)
	}
	compatMessages = normalizeToolCallMessages(compatMessages, buildToolOutcomeMap(toolOutcomes))
	openAITools := toolDefsToOpenAI(tools)

	var response *openai.ChatCompletion
	if streamHandler != nil {
		response, err = ap.chatCompletionStream(ctx, compatMessages, openAITools, streamHandler)
	} else {
		response, err = ap.chatCompletion(ctx, compatMessages, openAITools)
	}
	if err != nil {
		return nil, err
	}
	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("azure turn: model returned empty response")
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

func (ap *AzureProvider) chatCompletion(ctx context.Context, messages []openai.ChatCompletionMessageParamUnion, tools []openai.ChatCompletionToolParam) (*openai.ChatCompletion, error) {
	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: messages,
		N:        openai.Int(1),
	}
	if len(tools) > 0 {
		params.Tools = tools
	}
	applyProperties(ap.Properties, &params)
	client, err := ap.createClient(ctx)
	if err != nil {
		return nil, err
	}
	return client.Chat.Completions.New(ctx, params)
}

func (ap *AzureProvider) chatCompletionStream(ctx context.Context, messages []openai.ChatCompletionMessageParamUnion, tools []openai.ChatCompletionToolParam, streamHandler StreamChunkHandler) (*openai.ChatCompletion, error) {
	params := openai.ChatCompletionNewParams{
		Model:    ap.Model,
		Messages: messages,
		N:        openai.Int(1),
		StreamOptions: openai.ChatCompletionStreamOptionsParam{
			IncludeUsage: openai.Bool(true),
		},
	}
	if len(tools) > 0 {
		params.Tools = tools
	}
	applyProperties(ap.Properties, &params)

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

func (ap *AzureProvider) createClient(ctx context.Context) (openai.Client, error) {
	deploymentURL := fmt.Sprintf("%s/openai/deployments/%s", ap.BaseURL, ap.Model)
	options := []option.RequestOption{
		option.WithBaseURL(deploymentURL),
		option.WithHTTPClient(http.DefaultClient),
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

	for name, value := range ap.Headers {
		options = append(options, option.WithHeader(name, value))
	}

	return openai.NewClient(options...), nil
}
