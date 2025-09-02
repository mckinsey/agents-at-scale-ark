/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"maps"
	"time"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type OperationTracker struct {
	emitter   EventEmitter
	ctx       context.Context
	operation string
	name      string
	metadata  map[string]string
	startTime time.Time
}

func NewOperationTracker(emitter EventEmitter, ctx context.Context, operation, name string, metadata map[string]string) *OperationTracker {
	if metadata == nil {
		metadata = make(map[string]string)
	}

	tracker := &OperationTracker{
		emitter:   emitter,
		ctx:       ctx,
		operation: operation,
		name:      name,
		metadata:  metadata,
		startTime: time.Now(),
	}

	startEvent := OperationEvent{
		BaseEvent: BaseEvent{
			Name:     name,
			Metadata: metadata,
		},
	}
	emitter.EmitEvent(ctx, operation+"Start", startEvent)

	return tracker
}

func (t *OperationTracker) Complete(result string) {
	log := logf.FromContext(t.ctx)
	if log.V(3).Enabled() && result != "" {
		log.V(3).Info("operation response", "operation", t.operation, "name", t.name, "response", result)
	}
	t.emitCompletion(t.operation+"Complete", "", TokenUsage{})
}

func (t *OperationTracker) CompleteWithMetadata(result string, additionalMetadata map[string]string) {
	log := logf.FromContext(t.ctx)
	if log.V(3).Enabled() && result != "" {
		log.V(3).Info("operation response with metadata", "operation", t.operation, "name", t.name, "response", result, "metadata", additionalMetadata)
	}
	t.emitCompletionWithMetadata(t.operation+"Complete", "", TokenUsage{}, additionalMetadata)
}

func (t *OperationTracker) CompleteWithTokens(result string, tokenUsage TokenUsage) {
	log := logf.FromContext(t.ctx)
	if log.V(3).Enabled() && result != "" {
		log.V(3).Info("operation response with tokens", "operation", t.operation, "name", t.name, "response", result, "tokens", tokenUsage.TotalTokens)
	}
	t.emitCompletion(t.operation+"Complete", "", tokenUsage)
}

func (t *OperationTracker) Fail(err error) {
	errorMsg := ""
	if err != nil {
		errorMsg = err.Error()
	}
	t.emitCompletion(t.operation+"Error", errorMsg, TokenUsage{})
}

func (t *OperationTracker) CompleteWithTermination(terminationMessage string) {
	log := logf.FromContext(t.ctx)
	if log.V(3).Enabled() && terminationMessage != "" {
		log.V(3).Info("operation terminated", "operation", t.operation, "name", t.name, "terminationMessage", terminationMessage)
	}

	metadata := make(map[string]string)
	maps.Copy(metadata, t.metadata)
	metadata["terminationMessage"] = terminationMessage

	event := OperationEvent{
		BaseEvent: BaseEvent{
			Name:     t.name,
			Metadata: metadata,
		},
		Duration:   time.Since(t.startTime).String(),
		TokenUsage: TokenUsage{},
	}
	t.emitter.EmitEvent(t.ctx, t.operation+"Complete", event)
}

func (t *OperationTracker) emitCompletion(eventType, errorMsg string, tokenUsage TokenUsage) {
	t.emitCompletionWithMetadata(eventType, errorMsg, tokenUsage, nil)
}

func (t *OperationTracker) emitCompletionWithMetadata(eventType, errorMsg string, tokenUsage TokenUsage, additionalMetadata map[string]string) {
	metadata := make(map[string]string)
	maps.Copy(metadata, t.metadata)

	if additionalMetadata != nil {
		maps.Copy(metadata, additionalMetadata)
	}

	event := OperationEvent{
		BaseEvent: BaseEvent{
			Name:     t.name,
			Metadata: metadata,
		},
		Error:      errorMsg,
		Duration:   time.Since(t.startTime).String(),
		TokenUsage: tokenUsage,
	}
	t.emitter.EmitEvent(t.ctx, eventType, event)
}
