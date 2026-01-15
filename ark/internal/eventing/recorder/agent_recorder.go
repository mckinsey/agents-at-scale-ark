package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type agentRecorder struct {
	emitter eventing.EventEmitter
	operations.OperationTracker
}

func NewAgentRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.AgentRecorder {
	return &agentRecorder{
		emitter:          emitter,
		OperationTracker: operations.NewOperationTracker(operationEmitter),
	}
}

func (t *agentRecorder) DependencyUnavailable(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "DependencyUnavailable", reason)
}
