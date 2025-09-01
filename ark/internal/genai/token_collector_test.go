/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
)

type mockRecorder struct {
	events []EventData
}

func (m *mockRecorder) EmitEvent(ctx context.Context, eventType, reason string, data EventData) {
	m.events = append(m.events, data)
}

func TestTokenUsageCollector(t *testing.T) {
	mockRec := &mockRecorder{}
	collector := NewTokenUsageCollector(mockRec)

	ctx := context.Background()

	// Test that normal event gets passed through
	normalEvent := ExecutionEvent{
		BaseEvent: BaseEvent{Name: "test"},
		Type:      "agent",
	}
	collector.EmitEvent(ctx, corev1.EventTypeNormal, "TestEvent", normalEvent)

	// Test that operation event with token usage gets collected
	tokenEvent := OperationEvent{
		BaseEvent: BaseEvent{Name: "llm-call"},
		TokenUsage: TokenUsage{
			PromptTokens:     100,
			CompletionTokens: 50,
			TotalTokens:      150,
		},
	}
	collector.EmitEvent(ctx, corev1.EventTypeNormal, "LLMCallComplete", tokenEvent)

	// Test another token event
	tokenEvent2 := OperationEvent{
		BaseEvent: BaseEvent{Name: "llm-call-2"},
		TokenUsage: TokenUsage{
			PromptTokens:     200,
			CompletionTokens: 75,
			TotalTokens:      275,
		},
	}
	collector.EmitEvent(ctx, corev1.EventTypeNormal, "LLMCallComplete", tokenEvent2)

	// Verify events were passed through to underlying recorder
	assert.Len(t, mockRec.events, 3)

	// Verify token usage was aggregated correctly
	summary := collector.GetTokenSummary()
	assert.Equal(t, int64(300), summary.PromptTokens)     // 100 + 200
	assert.Equal(t, int64(125), summary.CompletionTokens) // 50 + 75
	assert.Equal(t, int64(425), summary.TotalTokens)      // 150 + 275

	// Test reset functionality
	collector.Reset()
	summary = collector.GetTokenSummary()
	assert.Equal(t, int64(0), summary.PromptTokens)
	assert.Equal(t, int64(0), summary.CompletionTokens)
	assert.Equal(t, int64(0), summary.TotalTokens)
}
