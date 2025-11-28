package noop

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
)

type NoopEventEmitter struct{}

func NewNoopEventEmitter() eventing.EventEmitter {
	return &NoopEventEmitter{}
}

func (e *NoopEventEmitter) EmitNormal(ctx context.Context, obj runtime.Object, reason, message string) {
}

func (e *NoopEventEmitter) EmitWarning(ctx context.Context, obj runtime.Object, reason, message string) {
}

func (e *NoopEventEmitter) EmitStructured(ctx context.Context, obj runtime.Object, eventType, reason, message string, data any) {
}
