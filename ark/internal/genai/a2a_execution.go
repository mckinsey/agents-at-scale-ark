/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	a2aclient "trpc.group/trpc-go/trpc-a2a-go/client"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
)

type StreamResubscriber interface {
	ResubscribeToTask(ctx context.Context, taskID string) (<-chan protocol.StreamingMessageEvent, error)
}

type a2aClientResubscriber struct {
	client *a2aclient.A2AClient
}

func (r *a2aClientResubscriber) ResubscribeToTask(ctx context.Context, taskID string) (<-chan protocol.StreamingMessageEvent, error) {
	return r.client.ResubscribeTask(ctx, protocol.TaskIDParams{
		RPCID: protocol.GenerateRPCID(),
		ID:    taskID,
	})
}

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

func (e *A2AExecutionEngine) ExecuteNative(ctx context.Context, agentName, namespace string, agentAnnotations map[string]string, contextID string, userInput protocol.Message, history []protocol.Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return e.executeA2A(ctx, agentName, namespace, agentAnnotations, contextID, userInput, history, eventStream, false)
}

func (e *A2AExecutionEngine) executeA2A(ctx context.Context, agentName, namespace string, agentAnnotations map[string]string, contextID string, userInput protocol.Message, history []protocol.Message, eventStream EventStreamInterface, includeOpenAIMessages bool) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	log.Info("executing A2A agent", "agent", agentName)

	a2aAddress, a2aServerName, err := getA2AServerRouting(agentAnnotations)
	if err != nil {
		return nil, err
	}

	operationData := map[string]string{
		"a2aServer":  a2aServerName,
		"serverAddr": a2aAddress,
		"protocol":   "a2a-jsonrpc",
	}
	ctx = e.eventingRecorder.Start(ctx, "A2AExecution", fmt.Sprintf("Executing A2A agent %s", agentName), operationData)

	var a2aServer arkv1prealpha1.A2AServer
	serverKey := client.ObjectKey{Name: a2aServerName, Namespace: namespace}
	if err = e.client.Get(ctx, serverKey, &a2aServer); err != nil {
		return nil, fmt.Errorf("unable to get A2AServer %v: %w", serverKey, err)
	}

	ctx, cancel, err := applyA2AServerTimeout(ctx, &a2aServer)
	if err != nil {
		return nil, err
	}
	if cancel != nil {
		defer cancel()
	}

	queryName := getQueryName(ctx)
	includeHistory := shouldIncludeA2AHistory(agentAnnotations, false)
	metadata, err := buildA2AMetadata(agentAnnotations, history, includeHistory)
	if err != nil {
		return nil, err
	}

	streamResult, streamed, streamErr := e.tryA2AStreamingExecution(ctx, a2aAddress, a2aServer.Spec.Headers, namespace, agentAnnotations, agentName, queryName, contextID, userInput, metadata, eventStream, &a2aServer, includeOpenAIMessages)
	if streamErr == nil && streamResult != nil {
		e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)
		return streamResult, nil
	}
	if streamed && streamErr != nil {
		log.Error(streamErr, "A2A streaming execution failed, falling back to blocking", "agent", agentName)
	}

	a2aResponse, err := ExecuteA2AAgent(ctx, e.client, a2aAddress, a2aServer.Spec.Headers, namespace, userInput, metadata, agentName, queryName, contextID, e.eventingRecorder, &a2aServer)
	if err != nil {
		modelID := fmt.Sprintf("agent/%s", agentName)
		streamA2AError(ctx, eventStream, modelID, err)
		e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
		return nil, err
	}

	if streamErr := emitA2ABlockingResponse(ctx, eventStream, agentName, a2aResponse); streamErr != nil {
		logf.FromContext(ctx).Error(streamErr, "failed to stream A2A blocking response", "agent", agentName)
	}

	e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)

	result := &ExecutionResult{
		A2AMessages: buildA2AMessagesFromResponse(a2aResponse),
		A2AResponse: a2aResponse,
	}
	if includeOpenAIMessages {
		result.Messages = []Message{buildAssistantMessageFromA2AResponse(a2aResponse)}
	}
	return result, nil
}

func (e *A2AExecutionEngine) streamA2AExecution(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace, agentName, queryName, contextID string, userInput protocol.Message, metadata map[string]interface{}, eventStream EventStreamInterface, a2aServer *arkv1prealpha1.A2AServer, includeOpenAIMessages bool) (*ExecutionResult, error) {
	ctx = WithStreamCorrelationID(ctx)
	log := logf.FromContext(ctx)
	correlationID := GetStreamCorrelationID(ctx)
	log.V(1).Info("starting A2A streaming execution", "correlationId", correlationID, "agent", agentName, "address", address)

	events, err := StreamA2AAgent(ctx, e.client, address, headers, namespace, userInput, metadata, agentName, contextID, e.eventingRecorder)
	if err != nil {
		return nil, err
	}

	rpcURL := strings.TrimSuffix(address, "/")
	a2aClient, clientErr := CreateA2AClient(ctx, e.client, rpcURL, headers, namespace, agentName, e.eventingRecorder)
	var resubscriber StreamResubscriber
	if clientErr == nil && a2aClient != nil {
		resubscriber = &a2aClientResubscriber{client: a2aClient}
	}

	response, err := e.consumeA2AStreamEvents(ctx, events, eventStream, agentName, namespace, queryName, a2aServer, resubscriber)
	if err != nil {
		return nil, err
	}
	result := &ExecutionResult{
		A2AMessages: buildA2AMessagesFromResponse(response),
		A2AResponse: response,
	}
	if includeOpenAIMessages {
		result.Messages = []Message{buildAssistantMessageFromA2AResponse(response)}
	}
	return result, nil
}

func (e *A2AExecutionEngine) consumeA2AStreamEvents(ctx context.Context, events <-chan protocol.StreamingMessageEvent, eventStream EventStreamInterface, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, resubscriber ...StreamResubscriber) (*A2AResponse, error) {
	state := &a2aStreamState{
		response: &A2AResponse{},
	}
	var resub StreamResubscriber
	if len(resubscriber) > 0 {
		resub = resubscriber[0]
	}

	currentEvents := events
	resubscribeAttempted := false

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case event, ok := <-currentEvents:
			if !ok {
				if !state.received {
					return nil, fmt.Errorf("a2a streaming returned no events")
				}
				if state.done {
					return state.finalize(), nil
				}
				// After resubscription, clients may receive duplicate or reordered events
			// because the resumed stream replays from the server's last checkpoint.
			// This is consistent with SSE replay semantics; clients should tolerate duplicates.
			if resub != nil && !resubscribeAttempted && state.response.TaskID != "" {
					resubscribeAttempted = true
					log := logf.FromContext(ctx)
					log.Info("stream closed before terminal state, attempting resubscribe", "taskId", state.response.TaskID, "agent", agentName)
				resumed, resubErr := resub.ResubscribeToTask(ctx, state.response.TaskID)
				if resubErr != nil {
					log.Error(resubErr, "resubscribe failed, returning partial result", "taskId", state.response.TaskID)
					result := state.finalize()
					result.Partial = true
					return result, nil
				}
					currentEvents = resumed
					continue
				}
				return state.finalize(), nil
			}
			state.received = true
			if event.Result == nil {
				continue
			}
			if err := state.handleEvent(ctx, e.client, event, eventStream, agentName, namespace, queryName, a2aServer); err != nil {
				return nil, err
			}
			if state.done {
				return state.finalize(), nil
			}
		}
	}
}

func getA2AServerRouting(agentAnnotations map[string]string) (string, string, error) {
	a2aAddress, hasAddress := agentAnnotations[arkann.A2AServerAddress]
	if !hasAddress {
		return "", "", fmt.Errorf("A2A agent missing %s annotation", arkann.A2AServerAddress)
	}
	a2aServerName, hasServerName := agentAnnotations[arkann.A2AServerName]
	if !hasServerName {
		return "", "", fmt.Errorf("A2A agent missing %s annotation", arkann.A2AServerName)
	}
	return a2aAddress, a2aServerName, nil
}

func applyA2AServerTimeout(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer) (context.Context, context.CancelFunc, error) {
	if a2aServer.Spec.Timeout == "" {
		return ctx, nil, nil
	}
	timeout, err := time.ParseDuration(a2aServer.Spec.Timeout)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse A2AServer timeout %q: %w", a2aServer.Spec.Timeout, err)
	}
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	return timeoutCtx, cancel, nil
}

func (e *A2AExecutionEngine) tryA2AStreamingExecution(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace string, agentAnnotations map[string]string, agentName, queryName, contextID string, userInput protocol.Message, metadata map[string]interface{}, eventStream EventStreamInterface, a2aServer *arkv1prealpha1.A2AServer, includeOpenAIMessages bool) (*ExecutionResult, bool, error) {
	if !isA2AStreamingSupported(agentAnnotations) {
		logf.FromContext(ctx).Info("A2A streaming not supported by agent", "agent", agentName)
		return nil, false, nil
	}
	result, err := e.streamA2AExecution(ctx, address, headers, namespace, agentName, queryName, contextID, userInput, metadata, eventStream, a2aServer, includeOpenAIMessages)
	if err != nil {
		return nil, true, err
	}
	return result, true, nil
}

func buildA2AMessagesFromResponse(response *A2AResponse) []protocol.Message {
	if response == nil {
		return nil
	}

	messageText := ""
	if response.Message != nil {
		messageText = extractTextFromParts(response.Message.Parts)
	}

	if response.Content != "" && response.Content != messageText {
		var contextRef *string
		if response.ContextID != "" {
			contextRef = &response.ContextID
		}
		var taskRef *string
		if response.TaskID != "" {
			taskRef = &response.TaskID
		}
		message := protocol.NewMessageWithContext(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(response.Content),
		}, taskRef, contextRef)
		return []protocol.Message{message}
	}

	if response.Message != nil {
		return []protocol.Message{*response.Message}
	}
	return nil
}

func emitA2ABlockingResponse(ctx context.Context, eventStream EventStreamInterface, agentName string, a2aResponse *A2AResponse) error {
	if eventStream == nil || a2aResponse == nil {
		return nil
	}
	completionID := getQueryID(ctx)
	modelID := fmt.Sprintf("agent/%s", agentName)
	return streamA2ANativeBlockingResponse(ctx, eventStream, modelID, completionID, a2aResponse)
}

func streamA2ANativeBlockingResponse(ctx context.Context, eventStream EventStreamInterface, modelID, completionID string, a2aResponse *A2AResponse) error {
	if a2aResponse.Message != nil {
		return streamA2AEvent(ctx, eventStream, a2aResponse.Message)
	}
	var contextRef *string
	if a2aResponse.ContextID != "" {
		contextRef = &a2aResponse.ContextID
	}
	var taskRef *string
	if a2aResponse.TaskID != "" {
		taskRef = &a2aResponse.TaskID
	}
	a2aMessage := protocol.NewMessageWithContext(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(a2aResponse.Content),
	}, taskRef, contextRef)
	return streamA2AEvent(ctx, eventStream, &a2aMessage)
}

type a2aStreamState struct {
	response          *A2AResponse
	finalContent      strings.Builder
	statusContent     strings.Builder
	latestTask        *protocol.Task
	lastStatus        *protocol.TaskStatus
	received          bool
	done              bool
	hasMessageContent bool
}

func (s *a2aStreamState) finalize() *A2AResponse {
	if s.finalContent.Len() == 0 {
		if s.statusContent.Len() > 0 {
			s.finalContent.WriteString(s.statusContent.String())
		} else {
			s.applyLatestTaskContent()
		}
	}
	s.response.Content = s.finalContent.String()
	if s.response.Message == nil && s.response.Content != "" {
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(s.response.Content),
		})
		s.response.Message = &message
	}
	return s.response
}

func (s *a2aStreamState) applyLatestTaskContent() {
	if s.latestTask == nil || s.finalContent.Len() > 0 {
		return
	}
	text, err := extractTextFromTask(s.latestTask)
	if err != nil || text == "" {
		return
	}
	s.finalContent.WriteString(text)
}

func (s *a2aStreamState) handleEvent(ctx context.Context, k8sClient client.Client, event protocol.StreamingMessageEvent, eventStream EventStreamInterface, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) error {
	switch result := event.Result.(type) {
	case *protocol.Message:
		return s.handleMessageEvent(ctx, eventStream, result)
	case *protocol.Task:
		return s.handleTaskEvent(ctx, k8sClient, eventStream, agentName, namespace, queryName, a2aServer, result)
	case *protocol.TaskStatusUpdateEvent:
		return s.handleTaskStatusUpdateEvent(ctx, k8sClient, eventStream, agentName, namespace, queryName, a2aServer, result)
	case *protocol.TaskArtifactUpdateEvent:
		return s.handleTaskArtifactUpdateEvent(ctx, k8sClient, eventStream, agentName, namespace, queryName, a2aServer, result)
	}
	return nil
}

func (s *a2aStreamState) handleMessageEvent(ctx context.Context, eventStream EventStreamInterface, message *protocol.Message) error {
	text := extractTextFromParts(message.Parts)
	if text != "" {
		s.finalContent.WriteString(text)
		s.hasMessageContent = true
	}
	s.response.Message = message
	if message.ContextID != nil && *message.ContextID != "" {
		s.response.ContextID = *message.ContextID
	}
	if message.TaskID != nil && *message.TaskID != "" {
		s.response.TaskID = *message.TaskID
	}
	return streamA2AEvent(ctx, eventStream, message)
}

func (s *a2aStreamState) handleTaskEvent(ctx context.Context, k8sClient client.Client, eventStream EventStreamInterface, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, task *protocol.Task) error {
	s.latestTask = task
	s.response.TaskID = task.ID
	s.response.ContextID = task.ContextID
	s.lastStatus = &task.Status
	s.response.Artifacts = task.Artifacts
	if message := extractLatestAgentMessageFromTask(task); message != nil {
		s.response.Message = message
	}
	maybeUpsertA2ATask(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
	return streamA2AEvent(ctx, eventStream, task)
}

func (s *a2aStreamState) handleTaskStatusUpdateEvent(ctx context.Context, k8sClient client.Client, eventStream EventStreamInterface, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, update *protocol.TaskStatusUpdateEvent) error {
	s.lastStatus = &update.Status
	if s.response.TaskID == "" {
		s.response.TaskID = update.TaskID
	}
	if s.response.ContextID == "" {
		s.response.ContextID = update.ContextID
	}
	task := taskFromStatusUpdate(update)
	maybeUpsertA2ATask(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
	if update.Status.Message != nil {
		s.response.Message = update.Status.Message
		if text := extractTextFromParts(update.Status.Message.Parts); text != "" {
			if s.statusContent.Len() > 0 {
				s.statusContent.WriteString("\n")
			}
			s.statusContent.WriteString(text)
		}
	}
	if err := streamA2AEvent(ctx, eventStream, update); err != nil {
		return err
	}
	if update.Final {
		s.done = true
	}
	return nil
}

func (s *a2aStreamState) handleTaskArtifactUpdateEvent(ctx context.Context, k8sClient client.Client, eventStream EventStreamInterface, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, update *protocol.TaskArtifactUpdateEvent) error {
	if s.response.TaskID == "" {
		s.response.TaskID = update.TaskID
	}
	if s.response.ContextID == "" {
		s.response.ContextID = update.ContextID
	}
	text := extractTextFromParts(update.Artifact.Parts)
	if text != "" {
		s.finalContent.WriteString(text)
	}
	s.response.Artifacts = append(s.response.Artifacts, update.Artifact)
	task := taskFromArtifactUpdate(update, s.lastStatus)
	maybeUpsertA2ATask(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
	return streamA2AEvent(ctx, eventStream, update)
}

func buildAssistantMessageFromA2AResponse(response *A2AResponse) Message {
	if response != nil && response.Message != nil {
		converted, err := A2AToOpenAIMessage(*response.Message)
		if err == nil {
			return converted
		}
	}
	if response != nil {
		return NewAssistantMessage(response.Content)
	}
	return NewAssistantMessage("")
}

func maybeUpsertA2ATask(ctx context.Context, k8sClient client.Client, task *protocol.Task, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) {
	if a2aServer == nil {
		return
	}
	_ = upsertA2ATaskFromTask(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer.Name)
}

func streamA2AEvent(ctx context.Context, eventStream EventStreamInterface, payload interface{}) error {
	if eventStream == nil {
		return nil
	}
	if err := eventStream.StreamChunk(ctx, payload); err != nil {
		return fmt.Errorf("failed to stream A2A event: %w", err)
	}
	return nil
}

func streamA2AError(ctx context.Context, eventStream EventStreamInterface, modelID string, err error) {
	if eventStream == nil || err == nil {
		return
	}
	taskID := getQueryID(ctx)
	contextID := GetA2AContextID(ctx)
	stepPayload := StepEventPayloadV1{
		Schema:    A2APayloadSchemaStepEventV1,
		StepID:    fmt.Sprintf("task-error:%s", taskID),
		StepState: "error",
		StepKind:  A2ADelegatedToolKindStatus,
	}
	statusMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart(err.Error()),
		&protocol.DataPart{Kind: protocol.KindData, Data: stepPayload},
	})
	failedEvent := &protocol.TaskStatusUpdateEvent{
		TaskID:    taskID,
		ContextID: contextID,
		Final:     true,
		Status: protocol.TaskStatus{
			State:   protocol.TaskStateFailed,
			Message: &statusMessage,
		},
	}
	if streamErr := streamA2AEvent(ctx, eventStream, failedEvent); streamErr != nil {
		logf.FromContext(ctx).Error(streamErr, "failed to stream A2A failure event")
	}
}
