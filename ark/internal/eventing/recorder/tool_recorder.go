package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type toolRecorder struct {
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewToolRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.ToolRecorder {
	return &toolRecorder{
		OperationTracker: operations.NewOperationTracker(operationEmitter),
		emitter:          emitter,
	}
}

func (t *toolRecorder) InlineSourceChanged(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitNormal(ctx, obj, "InlineSourceChanged", reason)
}
