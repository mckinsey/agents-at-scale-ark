package recorder

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/eventing/recorder/operations"
	"mckinsey.com/ark/internal/eventing/recorder/tokens"
)

type queryRecorder struct {
	tokens.TokenCollector
	operations.OperationTracker
	emitter eventing.EventEmitter
}

func NewQueryRecorder(emitter, operationEmitter eventing.EventEmitter) eventing.QueryRecorder {
	return &queryRecorder{
		TokenCollector:   tokens.NewTokenCollector(),
		OperationTracker: operations.NewOperationTracker(operationEmitter),
		emitter:          emitter,
	}
}

func (qr *queryRecorder) QueryParameterResolutionFailed(ctx context.Context, obj runtime.Object, parameterName, reason string) {
	qr.emitter.EmitWarning(ctx, obj, "QueryParameterResolutionFailed", fmt.Sprintf("Failed to resolve parameter %s: %s", parameterName, reason))
}

func (qr *queryRecorder) QueryParameterNotFound(ctx context.Context, obj runtime.Object, parameterName string) {
	qr.emitter.EmitWarning(ctx, obj, "QueryParameterNotFound", fmt.Sprintf("Parameter not found: %s", parameterName))
}
