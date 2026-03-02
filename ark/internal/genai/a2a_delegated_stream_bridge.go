package genai

import (
	"context"
	"fmt"

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
		payload := b.nextStepPayload()
		payload.DelegatedTaskID = value.TaskID
		payload.DelegatedContextID = value.ContextID
		if value.Status.Message != nil {
			message := *value.Status.Message
			appendPayloadPartToMessage(&message, payload)
			update.Status.Message = &message
		} else {
			msg := protocol.NewMessage(protocol.MessageRoleAgent, nil)
			appendPayloadPartToMessage(&msg, payload)
			update.Status.Message = &msg
		}
		return b.base.StreamChunk(ctx, &update)
	case *protocol.TaskArtifactUpdateEvent:
		update := *value
		payload := b.nextStepPayload()
		payload.DelegatedTaskID = value.TaskID
		payload.DelegatedContextID = value.ContextID
		artifact := value.Artifact
		artifact.Parts = appendPayloadPart(artifact.Parts, payload)
		update.Artifact = artifact
		return b.base.StreamChunk(ctx, &update)
	case *protocol.Message:
		message := *value
		appendPayloadPartToMessage(&message, b.nextStepPayload())
		return b.base.StreamChunk(ctx, &message)
	case protocol.Message:
		message := value
		appendPayloadPartToMessage(&message, b.nextStepPayload())
		return b.base.StreamChunk(ctx, message)
	case *protocol.Task:
		task := *value
		payload := b.nextStepPayload()
		payload.DelegatedTaskID = value.ID
		payload.DelegatedContextID = value.ContextID
		if value.Status.Message != nil {
			message := *value.Status.Message
			appendPayloadPartToMessage(&message, payload)
			task.Status.Message = &message
		} else {
			msg := protocol.NewMessage(protocol.MessageRoleAgent, nil)
			appendPayloadPartToMessage(&msg, payload)
			task.Status.Message = &msg
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

func (b *delegatedToolStreamBridge) nextStepPayload() StepEventPayloadV1 {
	b.sequence++
	extension := b.extension
	sequence := b.sequence
	extension.Sequence = &sequence
	payload := StepEventPayloadV1{
		Schema:             A2APayloadSchemaStepEventV1,
		StepID:             extension.StepID,
		StepState:          "",
		StepKind:           A2ADelegatedToolKindTool,
		ToolCallID:         extension.ToolCallID,
		ToolName:           extension.ToolName,
		ParentStepID:       extension.ParentStepID,
		DelegatedTaskID:    extension.DelegatedTaskID,
		DelegatedContextID: extension.DelegatedContextID,
		Sequence:           extension.Sequence,
	}
	if extension.ToolCallID != "" && extension.Sequence != nil {
		payload.StepEventID = extension.ToolCallID + ":" + fmt.Sprintf("%d", *extension.Sequence)
	}
	if payload.StepID == "" && extension.ToolCallID != "" {
		payload.StepID = buildToolStepID(extension.ToolCallID)
	}
	return payload
}
