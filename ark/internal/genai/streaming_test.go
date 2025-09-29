/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
)

func TestWrapChunkWithMetadata(t *testing.T) {
	tests := []struct {
		name          string
		setupContext  func() context.Context
		chunk         *openai.ChatCompletionChunk
		modelName     string
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
			expectWrapped: false,
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := tt.setupContext()
			result := WrapChunkWithMetadata(ctx, tt.chunk, tt.modelName)

			if !tt.expectWrapped {
				// Should return chunk as-is
				assert.Equal(t, tt.chunk, result)
			} else {
				// Should return wrapped chunk
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
				case "model from context overrides parameter":
					assert.Equal(t, "context-model", wrapped.Ark.Model)
				}
			}
		})
	}
}

func TestStreamMetadata_Empty(t *testing.T) {
	// Test that empty metadata is correctly identified
	emptyMeta := StreamMetadata{}
	assert.True(t, emptyMeta == StreamMetadata{})

	nonEmptyMeta := StreamMetadata{Query: "test"}
	assert.False(t, nonEmptyMeta == StreamMetadata{})
}
