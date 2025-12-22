package recorder

import (
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
