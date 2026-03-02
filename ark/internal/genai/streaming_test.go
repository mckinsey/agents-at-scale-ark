/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestWrapChunkWithMetadata(t *testing.T) {
	tests := []struct {
		name          string
		setupContext  func() context.Context
		chunk         *openai.ChatCompletionChunk
		modelName     string
		query         *arkv1alpha1.Query
		expectWrapped bool
	}{
		{
			name: "with full metadata",
			setupContext: func() context.Context {
				ctx := context.Background()
				ctx = WithQueryContext(ctx, "query-123", "session-456", "test-query")
				ctx = WithExecutionMetadata(ctx, map[string]interface{}{
					"target": "test-target",
					"team":   "test-team",
					"agent":  "test-agent",
					"model":  "test-model",
				})
				return ctx
			},
			chunk: &openai.ChatCompletionChunk{
				ID: "chunk-1",
			},
			modelName:     "fallback-model",
			expectWrapped: true,
		},
		{
			name: "with partial metadata",
			setupContext: func() context.Context {
				ctx := context.Background()
				ctx = WithQueryContext(ctx, "query-123", "", "")
				return ctx
			},
			chunk: &openai.ChatCompletionChunk{
				ID: "chunk-2",
			},
			modelName:     "test-model",
			expectWrapped: true,
		},
		{
			name: "with no metadata",
			setupContext: func() context.Context { //nolint:gocritic // test structure needs consistency
				return context.Background()
			},
			chunk: &openai.ChatCompletionChunk{
				ID: "chunk-3",
			},
			modelName:     "",
			expectWrapped: true,
		},
		{
			name: "model from context overrides parameter",
			setupContext: func() context.Context {
				ctx := context.Background()
				ctx = WithExecutionMetadata(ctx, map[string]interface{}{
					"model": "context-model",
				})
				return ctx
			},
			chunk: &openai.ChatCompletionChunk{
				ID: "chunk-4",
			},
			modelName:     "parameter-model",
			expectWrapped: true,
		},
		{
			name: "with completed query",
			setupContext: func() context.Context {
				ctx := context.Background()
				ctx = WithQueryContext(ctx, "query-123", "session-456", "test-query")
				return ctx
			},
			chunk: &openai.ChatCompletionChunk{
				ID: "chunk-5",
			},
			modelName: "test-model",
			query: &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name: "test-query",
					Annotations: map[string]string{
						"ark.mckinsey.com/a2a-context-id": "abc-123",
						"custom-annotation":               "custom-value",
					},
				},
			},
			expectWrapped: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := tt.setupContext()
			result := WrapChunkWithMetadata(ctx, tt.chunk, tt.modelName, tt.query)

			wrapped, ok := result.(ChunkWithMetadata)
			assert.True(t, ok, "expected ChunkWithMetadata type")
			assert.Equal(t, tt.chunk, wrapped.ChatCompletionChunk)
			assert.NotNil(t, wrapped.Ark)

			// Verify metadata fields based on context
			switch tt.name {
			case "with full metadata":
				assert.Equal(t, "query-123", wrapped.Ark.Query)
				assert.Equal(t, "session-456", wrapped.Ark.Session)
				assert.Equal(t, "test-target", wrapped.Ark.Target)
				assert.Equal(t, "test-team", wrapped.Ark.Team)
				assert.Equal(t, "test-agent", wrapped.Ark.Agent)
				assert.Equal(t, "test-model", wrapped.Ark.Model) // from context, not parameter
			case "with partial metadata":
				assert.Equal(t, "query-123", wrapped.Ark.Query)
				assert.Equal(t, "", wrapped.Ark.Session)
				assert.Equal(t, "test-model", wrapped.Ark.Model) // from parameter
			case "with no metadata":
				assert.Equal(t, "", wrapped.Ark.Query)
				assert.Equal(t, "", wrapped.Ark.Model)
			case "model from context overrides parameter":
				assert.Equal(t, "context-model", wrapped.Ark.Model)
			case "with completed query":
				assert.Equal(t, "query-123", wrapped.Ark.Query)
				assert.Equal(t, "session-456", wrapped.Ark.Session)
				assert.Equal(t, "test-model", wrapped.Ark.Model)
				assert.NotNil(t, wrapped.Ark.CompletedQuery)
				assert.Equal(t, "test-query", wrapped.Ark.CompletedQuery.Name)
				assert.Equal(t, "abc-123", wrapped.Ark.CompletedQuery.Annotations["ark.mckinsey.com/a2a-context-id"])
				assert.Equal(t, "custom-value", wrapped.Ark.CompletedQuery.Annotations["custom-annotation"])
			}
		})
	}
}

func TestStreamMetadata_Empty(t *testing.T) {
	emptyMeta := StreamMetadata{}
	assert.Equal(t, "", emptyMeta.Query)
	assert.Equal(t, "", emptyMeta.Model)
	assert.Nil(t, emptyMeta.CompletedQuery)

	nonEmptyMeta := StreamMetadata{Query: "test"}
	assert.Equal(t, "test", nonEmptyMeta.Query)
}

func TestSendFinalToolCallChunk(t *testing.T) {
	tests := []struct {
		name         string
		fullResponse *openai.ChatCompletion
		toolCalls    []openai.ChatCompletionMessageToolCall
		expectError  bool
		validateFunc func(*testing.T, *openai.ChatCompletionChunk)
	}{
		{
			name: "single tool call",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-123",
				Created: 1234567890,
				Model:   "gpt-4",
				Choices: []openai.ChatCompletionChoice{
					{
						FinishReason: "tool_calls",
					},
				},
			},
			toolCalls: []openai.ChatCompletionMessageToolCall{
				{
					ID:   "call_1",
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "get_weather",
						Arguments: `{"location":"New York"}`,
					},
				},
			},
			expectError: false,
			validateFunc: func(t *testing.T, chunk *openai.ChatCompletionChunk) {
				assert.Equal(t, "completion-123", chunk.ID)
				assert.Equal(t, "chat.completion.chunk", string(chunk.Object))
				assert.Equal(t, int64(1234567890), chunk.Created)
				assert.Equal(t, "gpt-4", chunk.Model)
				assert.Len(t, chunk.Choices, 1)
				assert.Len(t, chunk.Choices[0].Delta.ToolCalls, 1)

				toolCall := chunk.Choices[0].Delta.ToolCalls[0]
				assert.Equal(t, int64(0), toolCall.Index)
				assert.Equal(t, "call_1", toolCall.ID)
				assert.Equal(t, "function", toolCall.Type)
				assert.Equal(t, "get_weather", toolCall.Function.Name)
				assert.Equal(t, `{"location":"New York"}`, toolCall.Function.Arguments)
				assert.Equal(t, "tool_calls", chunk.Choices[0].FinishReason)
			},
		},
		{
			name: "multiple tool calls",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-456",
				Created: 1234567891,
				Model:   "gpt-4-turbo",
				Choices: []openai.ChatCompletionChoice{
					{
						FinishReason: "tool_calls",
					},
				},
			},
			toolCalls: []openai.ChatCompletionMessageToolCall{
				{
					ID:   "call_1",
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "get_weather",
						Arguments: `{"location":"New York"}`,
					},
				},
				{
					ID:   "call_2",
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "get_time",
						Arguments: `{"timezone":"EST"}`,
					},
				},
				{
					ID:   "call_3",
					Type: "function",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "calculate",
						Arguments: `{"expression":"2+2"}`,
					},
				},
			},
			expectError: false,
			validateFunc: func(t *testing.T, chunk *openai.ChatCompletionChunk) {
				assert.Len(t, chunk.Choices[0].Delta.ToolCalls, 3)

				// Verify all tool calls are present in order
				assert.Equal(t, int64(0), chunk.Choices[0].Delta.ToolCalls[0].Index)
				assert.Equal(t, "call_1", chunk.Choices[0].Delta.ToolCalls[0].ID)
				assert.Equal(t, "get_weather", chunk.Choices[0].Delta.ToolCalls[0].Function.Name)

				assert.Equal(t, int64(1), chunk.Choices[0].Delta.ToolCalls[1].Index)
				assert.Equal(t, "call_2", chunk.Choices[0].Delta.ToolCalls[1].ID)
				assert.Equal(t, "get_time", chunk.Choices[0].Delta.ToolCalls[1].Function.Name)

				assert.Equal(t, int64(2), chunk.Choices[0].Delta.ToolCalls[2].Index)
				assert.Equal(t, "call_3", chunk.Choices[0].Delta.ToolCalls[2].ID)
				assert.Equal(t, "calculate", chunk.Choices[0].Delta.ToolCalls[2].Function.Name)
			},
		},
		{
			name: "empty tool calls",
			fullResponse: &openai.ChatCompletion{
				ID:      "completion-789",
				Created: 1234567892,
				Model:   "gpt-4",
				Choices: []openai.ChatCompletionChoice{
					{
						FinishReason: "stop",
					},
				},
			},
			toolCalls:   []openai.ChatCompletionMessageToolCall{},
			expectError: false,
			validateFunc: func(t *testing.T, chunk *openai.ChatCompletionChunk) {
				assert.Len(t, chunk.Choices[0].Delta.ToolCalls, 0)
				assert.Equal(t, "stop", chunk.Choices[0].FinishReason)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var capturedChunk *openai.ChatCompletionChunk
			streamFunc := func(chunk *openai.ChatCompletionChunk) error {
				capturedChunk = chunk
				return nil
			}

			err := SendFinalToolCallChunk(tt.fullResponse, tt.toolCalls, streamFunc)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, capturedChunk, "chunk should be sent to stream function")
				if tt.validateFunc != nil {
					tt.validateFunc(t, capturedChunk)
				}
			}
		})
	}
}

func TestSendFinalToolCallChunk_StreamFunctionError(t *testing.T) {
	fullResponse := &openai.ChatCompletion{
		ID:      "completion-error",
		Created: 1234567890,
		Model:   "gpt-4",
		Choices: []openai.ChatCompletionChoice{
			{
				FinishReason: "tool_calls",
			},
		},
	}
	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID:   "call_1",
			Type: "function",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "test_function",
				Arguments: `{}`,
			},
		},
	}

	expectedError := assert.AnError
	streamFunc := func(chunk *openai.ChatCompletionChunk) error {
		return expectedError
	}

	err := SendFinalToolCallChunk(fullResponse, toolCalls, streamFunc)
	assert.Error(t, err)
	assert.Equal(t, expectedError, err)
}
