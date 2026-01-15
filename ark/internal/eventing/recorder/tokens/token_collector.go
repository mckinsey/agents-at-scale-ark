package tokens

import (
	"context"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type tokenUsageKeyType struct{}

var tokenUsageKey = tokenUsageKeyType{}

type TokenCollector struct{}

func NewTokenCollector() TokenCollector {
	return TokenCollector{}
}

func (tc *TokenCollector) StartTokenCollection(ctx context.Context) context.Context {
	usage := &arkv1alpha1.TokenUsage{}
	return context.WithValue(ctx, tokenUsageKey, usage)
}

func (tc *TokenCollector) AddTokens(ctx context.Context, promptTokens, completionTokens, totalTokens int64) {
	usage, ok := ctx.Value(tokenUsageKey).(*arkv1alpha1.TokenUsage)
	if !ok || usage == nil {
		return
	}

	usage.PromptTokens += promptTokens
	usage.CompletionTokens += completionTokens
	usage.TotalTokens += totalTokens
}

func (tc *TokenCollector) AddTokenUsage(ctx context.Context, usage arkv1alpha1.TokenUsage) {
	tc.AddTokens(ctx, usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
}

func (tc *TokenCollector) AddCompletionUsage(ctx context.Context, usage openai.CompletionUsage) {
	tc.AddTokens(ctx, usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
}

func (tc *TokenCollector) GetTokenSummary(ctx context.Context) arkv1alpha1.TokenUsage {
	usage, ok := ctx.Value(tokenUsageKey).(*arkv1alpha1.TokenUsage)
	if !ok || usage == nil {
		return arkv1alpha1.TokenUsage{}
	}

	return *usage
}
