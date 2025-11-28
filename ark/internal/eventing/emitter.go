package eventing

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"
)

type EventEmitter interface {
	EmitNormal(ctx context.Context, obj runtime.Object, reason, message string)
	EmitWarning(ctx context.Context, obj runtime.Object, reason, message string)
	EmitStructured(ctx context.Context, obj runtime.Object, eventType, reason, message string, data any)
}
