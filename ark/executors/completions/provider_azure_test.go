package completions

import (
	"testing"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/openai/openai-go"
	"github.com/stretchr/testify/require"
)

func TestAzureProvider_GetCredential_ManagedIdentity_SystemAssigned(t *testing.T) {
	ap := &AzureProvider{
		ManagedIdentity: &AzureManagedIdentityConfig{},
	}
	cred, err := ap.getCredential()
	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "expected *azidentity.ManagedIdentityCredential")
}

func TestAzureProvider_GetCredential_ManagedIdentity_UserAssigned(t *testing.T) {
	ap := &AzureProvider{
		ManagedIdentity: &AzureManagedIdentityConfig{ClientID: "my-client-id"},
	}
	cred, err := ap.getCredential()
	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "expected *azidentity.ManagedIdentityCredential")
}

func TestAzureProvider_GetCredential_WorkloadIdentity(t *testing.T) {
	ap := &AzureProvider{
		WorkloadIdentity: &AzureWorkloadIdentityConfig{
			ClientID: "wi-client-id",
			TenantID: "wi-tenant-id",
		},
	}
	cred, err := ap.getCredential()
	if err != nil {
		require.Contains(t, err.Error(), "token", "WorkloadIdentity path may fail in test env without token file")
		require.Nil(t, cred)
		return
	}
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.WorkloadIdentityCredential)
	require.True(t, ok, "expected *azidentity.WorkloadIdentityCredential")
}

func TestAzureProvider_GetCredential_NoIdentity_Error(t *testing.T) {
	ap := &AzureProvider{}
	cred, err := ap.getCredential()
	require.Error(t, err)
	require.Nil(t, cred)
	require.Contains(t, err.Error(), "no identity configuration")
}

func TestAzureProvider_GetCredential_ManagedIdentityPrecedence(t *testing.T) {
	ap := &AzureProvider{
		ManagedIdentity:  &AzureManagedIdentityConfig{ClientID: "mi-client"},
		WorkloadIdentity: &AzureWorkloadIdentityConfig{ClientID: "wi-client", TenantID: "wi-tenant"},
	}
	cred, err := ap.getCredential()
	require.NoError(t, err)
	require.NotNil(t, cred)
	_, ok := cred.(*azidentity.ManagedIdentityCredential)
	require.True(t, ok, "ManagedIdentity takes precedence over WorkloadIdentity")
}

func TestAzureProvider_FinalizeToolCalls(t *testing.T) {
	tests := []struct {
		name         string
		fullResponse *openai.ChatCompletion
		toolCallsMap map[int64]*openai.ChatCompletionMessageToolCall
		expectSent   bool
		expectError  bool
		validateFunc func(*testing.T, *openai.ChatCompletionChunk)
	}{
		{
			name: "with tool calls",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-1",
				Created: 1234567890,
				Model:   "gpt-4",
				Choices: []openai.ChatCompletionChoice{
					{
						Message: openai.ChatCompletionMessage{
							Role: "assistant",
						},
						FinishReason: "tool_calls",
					},
				},
			},
			toolCallsMap: map[int64]*openai.ChatCompletionMessageToolCall{
				0: {
					ID:   "call_1",
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "get_weather",
						Arguments: `{"location":"NYC"}`,
					},
				},
				1: {
					ID:   "call_2",
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "get_time",
						Arguments: `{"timezone":"EST"}`,
					},
				},
			},
			expectSent: true,
			validateFunc: func(t *testing.T, chunk *openai.ChatCompletionChunk) {
				require.NotNil(t, chunk)
				require.Len(t, chunk.Choices, 1)
				require.Len(t, chunk.Choices[0].Delta.ToolCalls, 2)
				require.Equal(t, "call_1", chunk.Choices[0].Delta.ToolCalls[0].ID)
				require.Equal(t, "call_2", chunk.Choices[0].Delta.ToolCalls[1].ID)
			},
		},
		{
			name: "empty tool calls map",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-2",
				Created: 1234567891,
				Model:   "gpt-4",
				Choices: []openai.ChatCompletionChoice{
					{
						Message: openai.ChatCompletionMessage{
							Role: "assistant",
						},
						FinishReason: "stop",
					},
				},
			},
			toolCallsMap: map[int64]*openai.ChatCompletionMessageToolCall{},
			expectSent:   false,
		},
		{
			name:         "nil full response",
			fullResponse: nil,
			toolCallsMap: map[int64]*openai.ChatCompletionMessageToolCall{
				0: {ID: "call_1"},
			},
			expectSent: false,
		},
		{
			name: "full response with no choices",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-3",
				Choices: []openai.ChatCompletionChoice{},
			},
			toolCallsMap: map[int64]*openai.ChatCompletionMessageToolCall{
				0: {ID: "call_1"},
			},
			expectSent: false,
		},
		{
			name: "with gaps in indices",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-4",
				Created: 1234567892,
				Model:   "gpt-4",
				Choices: []openai.ChatCompletionChoice{
					{
						Message:      openai.ChatCompletionMessage{Role: "assistant"},
						FinishReason: "tool_calls",
					},
				},
			},
			toolCallsMap: map[int64]*openai.ChatCompletionMessageToolCall{
				0: {ID: "call_1", Type: "function", Function: openai.ChatCompletionMessageToolCallFunction{Name: "func1", Arguments: "{}"}},
				2: {ID: "call_3", Type: "function", Function: openai.ChatCompletionMessageToolCallFunction{Name: "func3", Arguments: "{}"}},
			},
			expectSent: true,
			validateFunc: func(t *testing.T, chunk *openai.ChatCompletionChunk) {
				require.Len(t, chunk.Choices[0].Delta.ToolCalls, 2)
				require.Equal(t, "call_1", chunk.Choices[0].Delta.ToolCalls[0].ID)
				require.Equal(t, "call_3", chunk.Choices[0].Delta.ToolCalls[1].ID)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ap := &AzureProvider{}
			var capturedChunk *openai.ChatCompletionChunk
			chunkSent := false

			streamFunc := func(chunk *openai.ChatCompletionChunk) error {
				capturedChunk = chunk
				chunkSent = true
				return nil
			}

			ap.finalizeToolCalls(tt.fullResponse, tt.toolCallsMap, streamFunc)

			require.Equal(t, tt.expectSent, chunkSent, "unexpected chunk sent status")
			if tt.expectSent && tt.validateFunc != nil {
				tt.validateFunc(t, capturedChunk)
			}

			// Verify tool calls were added to full response if sent
			if tt.expectSent && tt.fullResponse != nil && len(tt.fullResponse.Choices) > 0 {
				require.NotNil(t, tt.fullResponse.Choices[0].Message.ToolCalls)
				require.Equal(t, len(tt.toolCallsMap), len(tt.fullResponse.Choices[0].Message.ToolCalls))
			}
		})
	}
}

func TestAzureProvider_EnsureUsageData(t *testing.T) {
	tests := []struct {
		name          string
		fullResponse  *openai.ChatCompletion
		expectedUsage openai.CompletionUsage
	}{
		{
			name: "already has usage data",
			fullResponse: &openai.ChatCompletion{
				Usage: openai.CompletionUsage{
					PromptTokens:     100,
					CompletionTokens: 50,
					TotalTokens:      150,
				},
			},
			expectedUsage: openai.CompletionUsage{
				PromptTokens:     100,
				CompletionTokens: 50,
				TotalTokens:      150,
			},
		},
		{
			name: "zero total tokens",
			fullResponse: &openai.ChatCompletion{
				Usage: openai.CompletionUsage{
					PromptTokens:     0,
					CompletionTokens: 0,
					TotalTokens:      0,
				},
			},
			expectedUsage: openai.CompletionUsage{
				PromptTokens:     0,
				CompletionTokens: 0,
				TotalTokens:      0,
			},
		},
		{
			name: "partial token data with zero total",
			fullResponse: &openai.ChatCompletion{
				Usage: openai.CompletionUsage{
					PromptTokens:     10,
					CompletionTokens: 5,
					TotalTokens:      0,
				},
			},
			expectedUsage: openai.CompletionUsage{
				PromptTokens:     0,
				CompletionTokens: 0,
				TotalTokens:      0,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ap := &AzureProvider{}
			ap.ensureUsageData(tt.fullResponse)

			require.Equal(t, tt.expectedUsage.PromptTokens, tt.fullResponse.Usage.PromptTokens)
			require.Equal(t, tt.expectedUsage.CompletionTokens, tt.fullResponse.Usage.CompletionTokens)
			require.Equal(t, tt.expectedUsage.TotalTokens, tt.fullResponse.Usage.TotalTokens)
		})
	}
}
