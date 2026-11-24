package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
	"mckinsey.com/ark/internal/eventing/recorder/tokens"
)

type teamRecorder struct {
	tokens.TokenCollector
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewTeamRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.TeamRecorder {
	return &teamRecorder{
		TokenCollector:   tokens.NewTokenCollector(),
		OperationTracker: operations.NewOperationTracker(operationEmitter),
		emitter:          emitter,
	}
}

func (t *teamRecorder) Created(ctx context.Context, obj runtime.Object) {
	t.emitter.EmitNormal(ctx, obj, "TeamCreated", "Initialized team conditions")
}

func (t *teamRecorder) StatusChanged(ctx context.Context, obj runtime.Object, message string) {
	t.emitter.EmitNormal(ctx, obj, "StatusChanged", message)
}
