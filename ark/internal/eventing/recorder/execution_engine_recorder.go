package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type executionEngineRecorder struct {
	emitter eventing.EventEmitter
	operations.OperationTracker
}

func NewExecutionEngineRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.ExecutionEngineRecorder {
	return &executionEngineRecorder{
		emitter:          emitter,
		OperationTracker: operations.NewOperationTracker(operationEmitter),
	}
}

func (t *executionEngineRecorder) AddressResolutionFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "AddressResolutionFailed", reason)
}
