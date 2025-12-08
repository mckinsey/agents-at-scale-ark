package recorder

import (
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type memoryRecorder struct {
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewMemoryRecorder(emitter eventing.EventEmitter) eventing.MemoryRecorder {
	return &memoryRecorder{
		OperationTracker: operations.NewOperationTracker(emitter),
		emitter:          emitter,
	}
}
