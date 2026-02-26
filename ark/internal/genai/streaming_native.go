package genai

import (
	"context"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func BuildNativeStreamCompletionEvent(ctx context.Context, query *arkv1alpha1.Query) *protocol.TaskStatusUpdateEvent {
	taskID := getQueryID(ctx)
	contextID := GetA2AContextID(ctx)

	state := protocol.TaskStateCompleted
	content := ""
	if query != nil && query.Status.Response != nil {
		content = query.Status.Response.Content
		if query.Status.Response.Phase == "error" {
			state = protocol.TaskStateFailed
		}
	}

	statusMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(content),
	})

	eventMetadata := map[string]interface{}{}
	if query != nil {
		eventMetadata["phase"] = query.Status.Phase
		eventMetadata["query"] = string(query.UID)
		if query.Status.TokenUsage.TotalTokens > 0 {
			eventMetadata["usage"] = map[string]int64{
				"promptTokens":     query.Status.TokenUsage.PromptTokens,
				"completionTokens": query.Status.TokenUsage.CompletionTokens,
				"totalTokens":      query.Status.TokenUsage.TotalTokens,
			}
		}
		if query.Status.Response != nil && query.Status.Response.A2A != nil {
			eventMetadata["a2a"] = query.Status.Response.A2A
		}
		if query.Status.Duration != nil {
			eventMetadata["duration"] = query.Status.Duration.Duration.String()
		}
	}

	return &protocol.TaskStatusUpdateEvent{
		TaskID:    taskID,
		ContextID: contextID,
		Final:     true,
		Status: protocol.TaskStatus{
			State:   state,
			Message: &statusMessage,
		},
		Metadata: eventMetadata,
	}
}
