/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
)

type A2AExecutionEngine struct {
	client           client.Client
	eventingRecorder eventing.A2aRecorder
}

func NewA2AExecutionEngine(k8sClient client.Client, eventingRecorder eventing.A2aRecorder) *A2AExecutionEngine {
	return &A2AExecutionEngine{
		client:           k8sClient,
		eventingRecorder: eventingRecorder,
	}
}

func (e *A2AExecutionEngine) Execute(ctx context.Context, agentName, namespace string, agentAnnotations map[string]string, contextID string, userInput Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	log.Info("executing A2A agent", "agent", agentName)

	a2aAddress, hasAddress := agentAnnotations[arkann.A2AServerAddress]
	if !hasAddress {
		return nil, fmt.Errorf("A2A agent missing %s annotation", arkann.A2AServerAddress)
	}

	a2aServerName, hasServerName := agentAnnotations[arkann.A2AServerName]
	if !hasServerName {
		return nil, fmt.Errorf("A2A agent missing %s annotation", arkann.A2AServerName)
	}

	operationData := map[string]string{
		"a2aServer":  a2aServerName,
		"serverAddr": a2aAddress,
		"protocol":   "a2a-jsonrpc",
	}
	ctx = e.eventingRecorder.Start(ctx, "A2AExecution", fmt.Sprintf("Executing A2A agent %s", agentName), operationData)

	var a2aServer arkv1prealpha1.A2AServer
	serverKey := client.ObjectKey{Name: a2aServerName, Namespace: namespace}
	if err := e.client.Get(ctx, serverKey, &a2aServer); err != nil {
		return nil, fmt.Errorf("unable to get A2AServer %v: %w", serverKey, err)
	}

	if a2aServer.Spec.Timeout != "" {
		timeout, err := time.ParseDuration(a2aServer.Spec.Timeout)
		if err != nil {
			return nil, fmt.Errorf("failed to parse A2AServer timeout %q: %w", a2aServer.Spec.Timeout, err)
		}
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	content := ""
	if userInput.OfUser != nil && userInput.OfUser.Content.OfString.Value != "" {
		content = userInput.OfUser.Content.OfString.Value
	}

	queryName := getQueryName(ctx)
	modelID := fmt.Sprintf("agent/%s", agentName)

	if agentAnnotations[arkann.A2AStreamingSupported] == TrueString && eventStream != nil {
		result, err := e.executeStreaming(ctx, a2aAddress, a2aServer.Spec.Headers, namespace, content, agentName, queryName, contextID, modelID, eventStream, &a2aServer)
		if err != nil {
			log.Error(err, "A2A streaming failed, falling back to blocking", "agent", agentName)
		} else {
			e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)
			return result, nil
		}
	}

	a2aResponse, err := ExecuteA2AAgent(ctx, e.client, a2aAddress, a2aServer.Spec.Headers, namespace, content, agentName, queryName, contextID, e.eventingRecorder, &a2aServer)
	if err != nil {
		StreamError(ctx, eventStream, err, "a2a_execution_failed", modelID)
		e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
		return nil, err
	}

	responseMessage := NewAssistantMessage(a2aResponse.Content)

	if eventStream != nil {
		completionID := getQueryID(ctx)
		chunk := NewContentChunk(completionID, modelID, a2aResponse.Content)
		chunk.Choices[0].Delta.Role = RoleAssistant
		chunk.Choices[0].FinishReason = "stop"
		chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
		if err := eventStream.StreamChunk(ctx, chunkWithMeta); err != nil {
			log.Error(err, "failed to send A2A response chunk to event stream")
		}
	}

	e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)

	return &ExecutionResult{
		Messages:    []Message{responseMessage},
		A2AResponse: a2aResponse,
	}, nil
}

func (e *A2AExecutionEngine) executeStreaming(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace, input, agentName, queryName, contextID, modelID string, eventStream EventStreamInterface, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, error) {
	rpcURL := strings.TrimSuffix(address, "/")

	a2aClient, err := CreateA2AClient(ctx, e.client, rpcURL, headers, namespace, agentName, e.eventingRecorder)
	if err != nil {
		return nil, err
	}

	var message protocol.Message
	if contextID != "" {
		message = protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(input),
		}, nil, &contextID)
	} else {
		message = protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(input),
		})
	}

	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
	}

	events, err := a2aClient.StreamMessage(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("A2A StreamMessage failed: %w", err)
	}

	completionID := getQueryID(ctx)
	return consumeA2AStreamEvents(ctx, e.client, events, eventStream, modelID, completionID, agentName, namespace, queryName, a2aServer)
}

func consumeA2AStreamEvents(ctx context.Context, k8sClient client.Client, events <-chan protocol.StreamingMessageEvent, eventStream EventStreamInterface, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, error) {
	var content strings.Builder
	var response A2AResponse
	received := false

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case event, ok := <-events:
			if !ok {
				if !received {
					return nil, fmt.Errorf("a2a streaming returned no events")
				}
				return buildA2AStreamResult(&content, &response), nil
			}
			received = true
			if event.Result == nil {
				continue
			}
			switch result := event.Result.(type) {
			case *protocol.Message:
				consumeA2AMessageEvent(ctx, result, &content, &response, eventStream, completionID, modelID)
			case *protocol.Task:
				consumeA2ATaskEvent(ctx, k8sClient, result, &content, &response, eventStream, completionID, modelID, agentName, namespace, queryName, a2aServer)
			case *protocol.TaskStatusUpdateEvent:
				if consumeA2AStatusUpdateEvent(ctx, result, &content, &response, eventStream, completionID, modelID) {
					return buildA2AStreamResult(&content, &response), nil
				}
			case *protocol.TaskArtifactUpdateEvent:
				consumeA2AArtifactUpdateEvent(ctx, result, &content, &response, eventStream, completionID, modelID)
			}
		}
	}
}

func consumeA2AMessageEvent(ctx context.Context, msg *protocol.Message, content *strings.Builder, response *A2AResponse, eventStream EventStreamInterface, completionID, modelID string) {
	text := extractTextFromParts(msg.Parts)
	if text != "" {
		content.WriteString(text)
	}
	if msg.ContextID != nil && *msg.ContextID != "" {
		response.ContextID = *msg.ContextID
	}
	streamContentChunk(ctx, eventStream, completionID, modelID, text)
}

func consumeA2ATaskEvent(ctx context.Context, k8sClient client.Client, task *protocol.Task, content *strings.Builder, response *A2AResponse, eventStream EventStreamInterface, completionID, modelID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) {
	response.TaskID = task.ID
	response.ContextID = task.ContextID
	text := extractTextFromTaskStatus(task)
	if text != "" {
		content.Reset()
		content.WriteString(text)
	}
	maybeCreateA2ATask(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
	streamContentChunk(ctx, eventStream, completionID, modelID, text)
}

func consumeA2AStatusUpdateEvent(ctx context.Context, event *protocol.TaskStatusUpdateEvent, content *strings.Builder, response *A2AResponse, eventStream EventStreamInterface, completionID, modelID string) bool {
	if response.TaskID == "" {
		response.TaskID = event.TaskID
	}
	if response.ContextID == "" {
		response.ContextID = event.ContextID
	}
	var text string
	if event.Status.Message != nil {
		text = extractTextFromParts(event.Status.Message.Parts)
	}
	if event.Final && text != "" && content.Len() == 0 {
		content.WriteString(text)
	}
	streamContentChunk(ctx, eventStream, completionID, modelID, text)
	return event.Final
}

func consumeA2AArtifactUpdateEvent(ctx context.Context, event *protocol.TaskArtifactUpdateEvent, content *strings.Builder, response *A2AResponse, eventStream EventStreamInterface, completionID, modelID string) {
	if response.TaskID == "" {
		response.TaskID = event.TaskID
	}
	text := extractTextFromParts(event.Artifact.Parts)
	if text != "" {
		content.WriteString(text)
	}
	streamContentChunk(ctx, eventStream, completionID, modelID, text)
}

func buildA2AStreamResult(content *strings.Builder, response *A2AResponse) *ExecutionResult {
	response.Content = content.String()
	return &ExecutionResult{
		Messages:    []Message{NewAssistantMessage(response.Content)},
		A2AResponse: response,
	}
}

func streamContentChunk(ctx context.Context, eventStream EventStreamInterface, completionID, modelID, content string) {
	if eventStream == nil || content == "" {
		return
	}
	chunk := NewContentChunk(completionID, modelID, content)
	chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
	if err := eventStream.StreamChunk(ctx, chunkWithMeta); err != nil {
		logf.FromContext(ctx).Error(err, "failed to send A2A streaming chunk")
	}
}

func extractTextFromTaskStatus(task *protocol.Task) string {
	if task.Status.Message != nil {
		if text := extractTextFromParts(task.Status.Message.Parts); text != "" {
			return text
		}
	}
	for i := len(task.History) - 1; i >= 0; i-- {
		msg := task.History[i]
		if msg.Role == protocol.MessageRoleAgent && len(msg.Parts) > 0 {
			if text := extractTextFromParts(msg.Parts); text != "" {
				return text
			}
		}
	}
	return ""
}

func maybeCreateA2ATask(ctx context.Context, k8sClient client.Client, task *protocol.Task, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) {
	if a2aServer == nil || queryName == "" {
		return
	}
	_ = handleA2ATaskResponse(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
}
