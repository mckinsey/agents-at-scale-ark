package recorder

import (
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type toolRecorder struct {
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewToolRecorder(emitter eventing.EventEmitter) eventing.ToolRecorder {
	return &toolRecorder{
		OperationTracker: operations.NewOperationTracker(emitter),
		emitter:          emitter,
	}
}
