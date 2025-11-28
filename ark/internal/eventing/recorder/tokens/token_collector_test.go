package tokens

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestTokenCollector_StartTokenCollection(t *testing.T) {
	tc := NewTokenCollector()
	ctx := context.Background()

	ctx = tc.StartTokenCollection(ctx)

	usage, ok := ctx.Value(tokenUsageKey).(*arkv1alpha1.TokenUsage)
	assert.True(t, ok, "Expected tokenUsageKey to be set in context")
	assert.NotNil(t, usage, "Expected usage to be initialized")
	assert.Equal(t, int64(0), usage.PromptTokens)
	assert.Equal(t, int64(0), usage.CompletionTokens)
	assert.Equal(t, int64(0), usage.TotalTokens)
}

func TestTokenCollector_AddTokens(t *testing.T) {
	tc := NewTokenCollector()
	ctx := tc.StartTokenCollection(context.Background())

	tc.AddTokens(ctx, 100, 50, 150)

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(100), usage.PromptTokens)
	assert.Equal(t, int64(50), usage.CompletionTokens)
	assert.Equal(t, int64(150), usage.TotalTokens)
}

func TestTokenCollector_AddTokens_Multiple(t *testing.T) {
	tc := NewTokenCollector()
	ctx := tc.StartTokenCollection(context.Background())

	tc.AddTokens(ctx, 100, 50, 150)
	tc.AddTokens(ctx, 200, 100, 300)

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(300), usage.PromptTokens)
	assert.Equal(t, int64(150), usage.CompletionTokens)
	assert.Equal(t, int64(450), usage.TotalTokens)
}

func TestTokenCollector_AddTokens_NoCollection(t *testing.T) {
	tc := NewTokenCollector()
	ctx := context.Background()

	tc.AddTokens(ctx, 100, 50, 150)

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(0), usage.PromptTokens)
	assert.Equal(t, int64(0), usage.CompletionTokens)
	assert.Equal(t, int64(0), usage.TotalTokens)
}

func TestTokenCollector_AddTokenUsage(t *testing.T) {
	tc := NewTokenCollector()
	ctx := tc.StartTokenCollection(context.Background())

	tokenUsage := arkv1alpha1.TokenUsage{
		PromptTokens:     100,
		CompletionTokens: 50,
		TotalTokens:      150,
	}
	tc.AddTokenUsage(ctx, tokenUsage)

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(100), usage.PromptTokens)
	assert.Equal(t, int64(50), usage.CompletionTokens)
	assert.Equal(t, int64(150), usage.TotalTokens)
}

func TestTokenCollector_AddCompletionUsage(t *testing.T) {
	tc := NewTokenCollector()
	ctx := tc.StartTokenCollection(context.Background())

	completionUsage := openai.CompletionUsage{
		PromptTokens:     100,
		CompletionTokens: 50,
		TotalTokens:      150,
	}
	tc.AddCompletionUsage(ctx, completionUsage)

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(100), usage.PromptTokens)
	assert.Equal(t, int64(50), usage.CompletionTokens)
	assert.Equal(t, int64(150), usage.TotalTokens)
}

func TestTokenCollector_GetTokenSummary_NoCollection(t *testing.T) {
	tc := NewTokenCollector()
	ctx := context.Background()

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(0), usage.PromptTokens)
	assert.Equal(t, int64(0), usage.CompletionTokens)
	assert.Equal(t, int64(0), usage.TotalTokens)
}

func TestTokenCollector_GetTokenSummary_NilUsage(t *testing.T) {
	tc := NewTokenCollector()
	ctx := context.WithValue(context.Background(), tokenUsageKey, nil)

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(0), usage.PromptTokens)
	assert.Equal(t, int64(0), usage.CompletionTokens)
	assert.Equal(t, int64(0), usage.TotalTokens)
}

func TestTokenCollector_GetTokenSummary_WrongType(t *testing.T) {
	tc := NewTokenCollector()
	ctx := context.WithValue(context.Background(), tokenUsageKey, "invalid")

	usage := tc.GetTokenSummary(ctx)
	assert.Equal(t, int64(0), usage.PromptTokens)
	assert.Equal(t, int64(0), usage.CompletionTokens)
	assert.Equal(t, int64(0), usage.TotalTokens)
}
