package genai

import (
	"context"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type NoopMemory struct{}

func NewNoopMemory() MemoryInterface {
	return &NoopMemory{}
}

func (n *NoopMemory) AddMessages(ctx context.Context, queryID string, messages []Message) error {
	logf.FromContext(ctx).V(2).Info("NoopMemory: AddMessages called - messages discarded", "queryId", queryID, "count", len(messages))
	return nil
}

func (n *NoopMemory) GetMessages(ctx context.Context) ([]Message, error) {
	logf.FromContext(ctx).V(2).Info("NoopMemory: GetMessages called - returning empty slice")
	return []Message{}, nil
}

func (n *NoopMemory) Close() error {
	logf.Log.V(2).Info("NoopMemory: Close called - no cleanup needed")
	return nil
}
