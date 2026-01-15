package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type a2aRecorder struct {
	emitter eventing.EventEmitter
	operations.OperationTracker
}

func NewA2aRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.A2aRecorder {
	return &a2aRecorder{
		emitter:          emitter,
		OperationTracker: operations.NewOperationTracker(operationEmitter),
	}
}

func (t *a2aRecorder) AgentCreationFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "AgentCreationFailed", reason)
}

func (t *a2aRecorder) AgentDeletionFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "AgentDeletionFailed", reason)
}

func (t *a2aRecorder) AgentDiscoveryFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "AgentDiscoveryFailed", reason)
}

func (t *a2aRecorder) TaskPollingFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "TaskPollingFailed", reason)
}

func (t *a2aRecorder) A2AMessageFailed(ctx context.Context, reason string) {
	if qd := t.GetQueryDetails(ctx); qd != nil && qd.Query != nil {
		t.emitter.EmitWarning(ctx, qd.Query, "A2AMessageFailed", reason)
	}
}

func (t *a2aRecorder) A2AConnectionFailed(ctx context.Context, reason string) {
	if qd := t.GetQueryDetails(ctx); qd != nil && qd.Query != nil {
		t.emitter.EmitWarning(ctx, qd.Query, "A2AConnectionFailed", reason)
	}
}

func (t *a2aRecorder) A2AHeaderResolutionFailed(ctx context.Context, reason string) {
	if qd := t.GetQueryDetails(ctx); qd != nil && qd.Query != nil {
		t.emitter.EmitWarning(ctx, qd.Query, "A2AHeaderResolutionFailed", reason)
	}
}

func (t *a2aRecorder) A2AResponseParseError(ctx context.Context, reason string) {
	if qd := t.GetQueryDetails(ctx); qd != nil && qd.Query != nil {
		t.emitter.EmitWarning(ctx, qd.Query, "A2AResponseParseError", reason)
	}
}
