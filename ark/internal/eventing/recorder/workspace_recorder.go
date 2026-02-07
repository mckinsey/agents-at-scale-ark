package recorder

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
)

type workspaceRecorder struct {
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewWorkspaceRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.WorkspaceRecorder {
	return &workspaceRecorder{
		OperationTracker: operations.NewOperationTracker(operationEmitter),
		emitter:          emitter,
	}
}

func (wr *workspaceRecorder) ProvisionFailed(ctx context.Context, obj runtime.Object, reason string) {
	wr.emitter.EmitWarning(ctx, obj, "WorkspaceProvisionFailed", fmt.Sprintf("Failed to provision workspace: %s", reason))
}

func (wr *workspaceRecorder) ReleaseFailed(ctx context.Context, obj runtime.Object, reason string) {
	wr.emitter.EmitWarning(ctx, obj, "WorkspaceReleaseFailed", fmt.Sprintf("Failed to release workspace: %s", reason))
}

func (wr *workspaceRecorder) CleanupFailed(ctx context.Context, obj runtime.Object, reason string) {
	wr.emitter.EmitWarning(ctx, obj, "WorkspaceCleanupFailed", fmt.Sprintf("Failed to cleanup workspace: %s", reason))
}

func (wr *workspaceRecorder) AutoCommitFailed(ctx context.Context, obj runtime.Object, reason string) {
	wr.emitter.EmitWarning(ctx, obj, "WorkspaceAutoCommitFailed", fmt.Sprintf("Failed to auto-commit workspace changes: %s", reason))
}
