/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"sync"
)

type TokenUsageCollector struct {
	recorder    EventEmitter
	mu          sync.RWMutex
	tokenUsages []TokenUsage
}

func NewTokenUsageCollector(recorder EventEmitter) *TokenUsageCollector {
	return &TokenUsageCollector{
		recorder:    recorder,
		tokenUsages: make([]TokenUsage, 0),
	}
}

func (c *TokenUsageCollector) EmitEvent(ctx context.Context, eventType, reason string, data EventData) {
	c.recorder.EmitEvent(ctx, eventType, reason, data)

	if opEvent, ok := data.(OperationEvent); ok && opEvent.TokenUsage.TotalTokens > 0 {
		c.mu.Lock()
		c.tokenUsages = append(c.tokenUsages, opEvent.TokenUsage)
		c.mu.Unlock()
	}
}

func (c *TokenUsageCollector) GetTokenSummary() TokenUsage {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var total TokenUsage
	for _, usage := range c.tokenUsages {
		total.PromptTokens += usage.PromptTokens
		total.CompletionTokens += usage.CompletionTokens
		total.TotalTokens += usage.TotalTokens
	}

	return total
}

func (c *TokenUsageCollector) Reset() {
	c.mu.Lock()
	c.tokenUsages = make([]TokenUsage, 0)
	c.mu.Unlock()
}
