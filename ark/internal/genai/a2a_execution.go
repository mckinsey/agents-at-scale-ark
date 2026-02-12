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

// Execute executes a query against an A2A agent
func (e *A2AExecutionEngine) Execute(ctx context.Context, agentName, namespace string, agentAnnotations map[string]string, contextID string, userInput Message, history []Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
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
	a2aHistory := make([]protocol.Message, 0, len(history))
	for i := range history {
		converted, convErr := OpenAIToA2AMessage(history[i])
		if convErr != nil {
			return nil, fmt.Errorf("failed to convert history message %d to A2A: %w", i, convErr)
		}
		a2aHistory = append(a2aHistory, converted)
	}
	a2aUserInput, err := OpenAIToA2AMessage(userInput)
	if err != nil {
		return nil, fmt.Errorf("failed to convert user input to A2A: %w", err)
	}
	metadata, err := buildA2AMetadata(agentAnnotations, a2aHistory, includeHistory)
	if err != nil {
		return nil, err
	}

	experimentalEnabled := resolveA2AExperimentalExecutionEnabled(ctx, agentAnnotations)
	payloadMode := resolveA2AExecutionPayloadMode(ctx, agentAnnotations)
	streamResult, streamed, streamErr := e.tryA2AStreamingExecution(ctx, a2aAddress, a2aServer.Spec.Headers, namespace, agentAnnotations, agentName, queryName, contextID, a2aUserInput, metadata, eventStream, payloadMode, &a2aServer)
	if streamErr == nil && streamResult != nil {
		e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)
		return streamResult, nil
	}
	if streamed && streamErr != nil {
		if experimentalEnabled {
			modelID := fmt.Sprintf("agent/%s", agentName)
			streamA2AError(ctx, eventStream, payloadMode, modelID, streamErr)
			e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", streamErr), streamErr, operationData)
			return nil, streamErr
		}
		log.Error(streamErr, "A2A streaming execution failed, falling back to blocking", "agent", agentName)
	}

	a2aResponse, err := ExecuteA2AAgent(ctx, e.client, a2aAddress, a2aServer.Spec.Headers, namespace, a2aUserInput, metadata, agentName, queryName, contextID, e.eventingRecorder, &a2aServer)
	if err != nil {
		modelID := fmt.Sprintf("agent/%s", agentName)
		streamA2AError(ctx, eventStream, payloadMode, modelID, err)
		e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
		return nil, err
	}

	responseMessage := buildAssistantMessageFromA2AResponse(a2aResponse)
	emitA2ABlockingResponse(ctx, eventStream, payloadMode, agentName, a2aResponse)

	e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)

	return &ExecutionResult{
		Messages:       []Message{responseMessage},
		A2AResponse:    a2aResponse,
		A2APayloadMode: payloadMode,
	}, nil
}

func (e *A2AExecutionEngine) streamA2AExecution(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace, agentName, queryName, contextID string, userInput protocol.Message, metadata map[string]interface{}, eventStream EventStreamInterface, payloadMode string, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, error) {
	events, err := StreamA2AAgent(ctx, e.client, address, headers, namespace, userInput, metadata, agentName, contextID, e.eventingRecorder)
	if err != nil {
		return nil, err
	}

	modelID := fmt.Sprintf("agent/%s", agentName)
	completionID := getQueryID(ctx)
	response, err := e.consumeA2AStreamEvents(ctx, events, eventStream, payloadMode, modelID, completionID, agentName, namespace, queryName, a2aServer)
	if err != nil {
		return nil, err
	}
	responseMessage := buildAssistantMessageFromA2AResponse(response)
	return &ExecutionResult{
		Messages:       []Message{responseMessage},
		A2AResponse:    response,
		A2APayloadMode: payloadMode,
	}, nil
}

func (e *A2AExecutionEngine) consumeA2AStreamEvents(ctx context.Context, events <-chan protocol.StreamingMessageEvent, eventStream EventStreamInterface, payloadMode, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) (*A2AResponse, error) {
	state := &a2aStreamState{
		response: &A2AResponse{},
	}
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case event, ok := <-events:
			if !ok {
				if !state.received {
					return nil, fmt.Errorf("a2a streaming returned no events")
				}
				return state.finalize(), nil
			}
			state.received = true
			if event.Result == nil {
				continue
			}
			state.handleEvent(ctx, e.client, event, eventStream, payloadMode, modelID, completionID, agentName, namespace, queryName, a2aServer)
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

func resolveA2AExecutionPayloadMode(ctx context.Context, agentAnnotations map[string]string) string {
	payloadMode := GetA2APayloadModeFromContext(ctx)
	if payloadMode != A2APayloadModeCompat {
		return payloadMode
	}
	if resolveA2AExperimentalExecutionEnabled(ctx, agentAnnotations) {
		return A2APayloadModeNative
	}
	return A2APayloadModeCompat
}

func resolveA2AExperimentalExecutionEnabled(ctx context.Context, agentAnnotations map[string]string) bool {
	if HasA2AExperimentalEnabledInContext(ctx) {
		return IsA2AExperimentalEnabledInContext(ctx)
	}
	return IsA2AExperimentalEnabled(agentAnnotations)
}

func (e *A2AExecutionEngine) tryA2AStreamingExecution(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace string, agentAnnotations map[string]string, agentName, queryName, contextID string, userInput protocol.Message, metadata map[string]interface{}, eventStream EventStreamInterface, payloadMode string, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, bool, error) {
	if !isA2AStreamingSupported(agentAnnotations) {
		logf.FromContext(ctx).Info("A2A streaming not supported by agent", "agent", agentName)
		return nil, false, nil
	}
	result, err := e.streamA2AExecution(ctx, address, headers, namespace, agentName, queryName, contextID, userInput, metadata, eventStream, payloadMode, a2aServer)
	if err != nil {
		return nil, true, err
	}
	return result, true, nil
}

func emitA2ABlockingResponse(ctx context.Context, eventStream EventStreamInterface, payloadMode, agentName string, a2aResponse *A2AResponse) {
	if eventStream == nil || a2aResponse == nil {
		return
	}
	completionID := getQueryID(ctx)
	modelID := fmt.Sprintf("agent/%s", agentName)
	if payloadMode == A2APayloadModeNative {
		streamA2ANativeBlockingResponse(ctx, eventStream, payloadMode, modelID, completionID, a2aResponse)
		return
	}
	streamA2ACompatBlockingResponse(ctx, eventStream, modelID, completionID, a2aResponse.Content)
}

func streamA2ANativeBlockingResponse(ctx context.Context, eventStream EventStreamInterface, payloadMode, modelID, completionID string, a2aResponse *A2AResponse) {
	if a2aResponse.Message != nil {
		streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, extractTextFromParts(a2aResponse.Message.Parts), a2aResponse.Message)
		return
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
	streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, a2aResponse.Content, &a2aMessage)
}

func streamA2ACompatBlockingResponse(ctx context.Context, eventStream EventStreamInterface, modelID, completionID, content string) {
	chunk := &openai.ChatCompletionChunk{
		ID:      completionID,
		Object:  "chat.completion.chunk",
		Created: time.Now().Unix(),
		Model:   modelID,
		Choices: []openai.ChatCompletionChunkChoice{
			{
				Index: 0,
				Delta: openai.ChatCompletionChunkChoiceDelta{
					Content: content,
					Role:    RoleAssistant,
				},
				FinishReason: "stop",
			},
		},
	}
	chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
	if err := eventStream.StreamChunk(ctx, chunkWithMeta); err != nil {
		logf.FromContext(ctx).Error(err, "failed to send A2A response chunk to event stream")
	}
}

type a2aStreamState struct {
	response     *A2AResponse
	finalContent strings.Builder
	latestTask   *protocol.Task
	lastStatus   *protocol.TaskStatus
	received     bool
	done         bool
}

func (s *a2aStreamState) finalize() *A2AResponse {
	s.applyLatestTaskContent()
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
	if s.latestTask == nil {
		return
	}
	text, err := extractTextFromTask(s.latestTask)
	if err != nil || text == "" {
		return
	}
	s.finalContent.Reset()
	s.finalContent.WriteString(text)
}

func (s *a2aStreamState) handleEvent(ctx context.Context, k8sClient client.Client, event protocol.StreamingMessageEvent, eventStream EventStreamInterface, payloadMode, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) {
	switch result := event.Result.(type) {
	case *protocol.Message:
		s.handleMessageEvent(ctx, eventStream, payloadMode, modelID, completionID, result)
	case *protocol.Task:
		s.handleTaskEvent(ctx, k8sClient, eventStream, payloadMode, modelID, completionID, agentName, namespace, queryName, a2aServer, result)
	case *protocol.TaskStatusUpdateEvent:
		s.handleTaskStatusUpdateEvent(ctx, k8sClient, eventStream, payloadMode, modelID, completionID, agentName, namespace, queryName, a2aServer, result)
	case *protocol.TaskArtifactUpdateEvent:
		s.handleTaskArtifactUpdateEvent(ctx, k8sClient, eventStream, payloadMode, modelID, completionID, agentName, namespace, queryName, a2aServer, result)
	}
}

func (s *a2aStreamState) handleMessageEvent(ctx context.Context, eventStream EventStreamInterface, payloadMode, modelID, completionID string, message *protocol.Message) {
	text := extractTextFromParts(message.Parts)
	if text != "" {
		s.finalContent.WriteString(text)
	}
	s.response.Message = message
	if message.ContextID != nil && *message.ContextID != "" {
		s.response.ContextID = *message.ContextID
	}
	if message.TaskID != nil && *message.TaskID != "" {
		s.response.TaskID = *message.TaskID
	}
	streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, text, message)
	s.done = true
}

func (s *a2aStreamState) handleTaskEvent(ctx context.Context, k8sClient client.Client, eventStream EventStreamInterface, payloadMode, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, task *protocol.Task) {
	s.latestTask = task
	s.response.TaskID = task.ID
	s.response.ContextID = task.ContextID
	s.lastStatus = &task.Status
	s.response.Artifacts = task.Artifacts
	if message := extractLatestAgentMessageFromTask(task); message != nil {
		s.response.Message = message
	}
	maybeUpsertA2ATask(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
	streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, "", task)
}

func (s *a2aStreamState) handleTaskStatusUpdateEvent(ctx context.Context, k8sClient client.Client, eventStream EventStreamInterface, payloadMode, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, update *protocol.TaskStatusUpdateEvent) {
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
	}
	if update.Final && update.Status.Message != nil && s.finalContent.Len() == 0 {
		if text := extractTextFromParts(update.Status.Message.Parts); text != "" {
			s.finalContent.WriteString(text)
		}
	}
	streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, "", update)
	if update.Final {
		s.done = true
	}
}

func (s *a2aStreamState) handleTaskArtifactUpdateEvent(ctx context.Context, k8sClient client.Client, eventStream EventStreamInterface, payloadMode, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer, update *protocol.TaskArtifactUpdateEvent) {
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
	streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, text, update)
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

func streamA2AEvent(ctx context.Context, eventStream EventStreamInterface, payloadMode, modelID, completionID, content string, payload interface{}) {
	if eventStream == nil {
		return
	}
	if payloadMode == A2APayloadModeNative {
		_ = eventStream.StreamChunk(ctx, payload)
		return
	}
	chunk := NewContentChunk(completionID, modelID, content)
	chunkWithMeta := WrapChunkWithA2A(ctx, chunk, modelID, nil, payload)
	_ = eventStream.StreamChunk(ctx, chunkWithMeta)
}

func streamA2AError(ctx context.Context, eventStream EventStreamInterface, payloadMode, modelID string, err error) {
	if eventStream == nil || err == nil {
		return
	}
	if payloadMode == A2APayloadModeNative {
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(err.Error()),
		})
		streamA2AEvent(ctx, eventStream, payloadMode, modelID, getQueryID(ctx), err.Error(), &message)
		return
	}
	StreamError(ctx, eventStream, err, "a2a_execution_failed", modelID)
}
