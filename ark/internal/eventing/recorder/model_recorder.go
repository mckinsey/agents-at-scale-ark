package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
	"mckinsey.com/ark/internal/eventing/recorder/tokens"
)

type modelRecorder struct {
	tokens.TokenCollector
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewModelRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.ModelRecorder {
	return &modelRecorder{
		TokenCollector:   tokens.NewTokenCollector(),
		OperationTracker: operations.NewOperationTracker(operationEmitter),
		emitter:          emitter,
	}
}

func (t *modelRecorder) ModelUnavailable(ctx context.Context, model runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, model, "ModelUnavailable", reason)
}
