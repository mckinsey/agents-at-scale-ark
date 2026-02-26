package genai

import (
	"context"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
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

func (n *NoopMemory) AddA2AMessages(ctx context.Context, queryID string, messages []protocol.Message) error {
	logf.FromContext(ctx).V(2).Info("NoopMemory: AddA2AMessages called - messages discarded", "queryId", queryID, "count", len(messages))
	return nil
}

func (n *NoopMemory) GetA2AMessages(ctx context.Context) ([]protocol.Message, error) {
	logf.FromContext(ctx).V(2).Info("NoopMemory: GetA2AMessages called - returning empty slice")
	return []protocol.Message{}, nil
}

func (n *NoopMemory) Close() error {
	logf.Log.V(2).Info("NoopMemory: Close called - no cleanup needed")
	return nil
}
