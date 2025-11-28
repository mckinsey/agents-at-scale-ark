package recorder

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
)

type mcpServerRecorder struct {
	emitter eventing.EventEmitter
}

func NewMCPServerRecorder(emitter eventing.EventEmitter) eventing.MCPServerRecorder {
	return &mcpServerRecorder{
		emitter: emitter,
	}
}

func (t *mcpServerRecorder) AddressResolutionFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "AddressResolutionFailed", reason)
}

func (t *mcpServerRecorder) ClientCreationFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "ClientCreationFailed", reason)
}

func (t *mcpServerRecorder) ToolListingFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "ToolListingFailed", reason)
}

func (t *mcpServerRecorder) ToolCreationFailed(ctx context.Context, obj runtime.Object, reason string) {
	t.emitter.EmitWarning(ctx, obj, "ToolCreationFailed", reason)
}
