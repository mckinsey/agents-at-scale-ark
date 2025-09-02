/* Copyright 2025. McKinsey & Company */

package genai

import "context"

type EventEmitter interface {
	EmitEvent(ctx context.Context, eventType, reason string, data EventData)
}

type EventData interface {
	ToMap() map[string]interface{}
}

type BaseEvent struct {
	Name     string            `json:"name"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

func (e BaseEvent) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"name": e.Name,
	}
	for key, value := range e.Metadata {
		result[key] = value
	}
	return result
}

type ExecutionEvent struct {
	BaseEvent
	Type string `json:"type,omitempty"`
}

func (e ExecutionEvent) ToMap() map[string]interface{} {
	result := e.BaseEvent.ToMap()
	if e.Type != "" {
		result["type"] = e.Type
	}
	return result
}

type TokenUsage struct {
	PromptTokens     int64 `json:"prompt_tokens,omitempty"`
	CompletionTokens int64 `json:"completion_tokens,omitempty"`
	TotalTokens      int64 `json:"total_tokens,omitempty"`
}

type OperationEvent struct {
	BaseEvent
	Error      string     `json:"error,omitempty"`
	Duration   string     `json:"duration,omitempty"`
	TokenUsage TokenUsage `json:"token_usage,omitempty"`
}

func (e OperationEvent) ToMap() map[string]interface{} {
	result := e.BaseEvent.ToMap()
	if e.Error != "" {
		result["error"] = e.Error
	}
	if e.Duration != "" {
		result["duration"] = e.Duration
	}
	if e.TokenUsage.TotalTokens > 0 {
		result["token_usage"] = map[string]interface{}{
			"prompt_tokens":     e.TokenUsage.PromptTokens,
			"completion_tokens": e.TokenUsage.CompletionTokens,
			"total_tokens":      e.TokenUsage.TotalTokens,
		}
	}
	return result
}
