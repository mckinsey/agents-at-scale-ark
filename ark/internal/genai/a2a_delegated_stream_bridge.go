package genai

import (
	"context"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

type delegatedToolStreamBridge struct {
	base      EventStreamInterface
	extension A2ADelegatedToolExtension
	sequence  int
}

func newDelegatedToolStreamBridge(base EventStreamInterface, extension A2ADelegatedToolExtension) EventStreamInterface {
	if base == nil {
		return nil
	}
	return &delegatedToolStreamBridge{
		base:      base,
		extension: extension,
		sequence:  0,
	}
}

func (b *delegatedToolStreamBridge) StreamChunk(ctx context.Context, chunk interface{}) error {
	switch value := chunk.(type) {
	case *protocol.TaskStatusUpdateEvent:
		update := *value
		extension := b.nextExtension()
		extension.DelegatedTaskID = value.TaskID
		extension.DelegatedContextID = value.ContextID
		update.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(value.Metadata), extension)
		if value.Status.Message != nil {
			message := *value.Status.Message
			message.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(message.Metadata), extension)
			update.Status.Message = &message
		}
		return b.base.StreamChunk(ctx, &update)
	case *protocol.TaskArtifactUpdateEvent:
		update := *value
		extension := b.nextExtension()
		extension.DelegatedTaskID = value.TaskID
		extension.DelegatedContextID = value.ContextID
		update.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(value.Metadata), extension)
		artifact := value.Artifact
		artifact.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(artifact.Metadata), extension)
		update.Artifact = artifact
		return b.base.StreamChunk(ctx, &update)
	case *protocol.Message:
		message := *value
		extension := b.nextExtension()
		message.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(value.Metadata), extension)
		return b.base.StreamChunk(ctx, &message)
	case protocol.Message:
		message := value
		extension := b.nextExtension()
		message.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(value.Metadata), extension)
		return b.base.StreamChunk(ctx, message)
	case *protocol.Task:
		task := *value
		extension := b.nextExtension()
		extension.DelegatedTaskID = value.ID
		extension.DelegatedContextID = value.ContextID
		task.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(value.Metadata), extension)
		if value.Status.Message != nil {
			message := *value.Status.Message
			message.Metadata = withA2ADelegatedToolExtension(copyA2AMetadata(message.Metadata), extension)
			task.Status.Message = &message
		}
		return b.base.StreamChunk(ctx, &task)
	default:
		return b.base.StreamChunk(ctx, chunk)
	}
}

func (b *delegatedToolStreamBridge) NotifyCompletion(ctx context.Context) error {
	return b.base.NotifyCompletion(ctx)
}

func (b *delegatedToolStreamBridge) Close() error {
	return b.base.Close()
}

func (b *delegatedToolStreamBridge) nextExtension() A2ADelegatedToolExtension {
	b.sequence++
	extension := b.extension
	sequence := b.sequence
	extension.Sequence = &sequence
	return extension
}
