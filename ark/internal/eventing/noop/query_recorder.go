package noop

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
	"mckinsey.com/ark/internal/eventing/recorder/tokens"
)

type noopQueryRecorder struct {
	tokens.TokenCollector
	operations.OperationTracker
}

func NewQueryRecorder() eventing.QueryRecorder {
	emitter := NewNoopEventEmitter()
	return &noopQueryRecorder{
		TokenCollector:   tokens.NewTokenCollector(),
		OperationTracker: operations.NewOperationTracker(emitter),
	}
}

func (n *noopQueryRecorder) QueryParameterResolutionFailed(ctx context.Context, obj runtime.Object, parameterName, reason string) {
}

func (n *noopQueryRecorder) QueryParameterNotFound(ctx context.Context, obj runtime.Object, parameterName string) {
}
