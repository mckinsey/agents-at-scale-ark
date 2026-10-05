/* Copyright 2025. McKinsey & Company */

package completions

import (
	"context"
	"fmt"
	"strings"
	"time"

	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
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

	ctx, cancel, err := withA2AExecutionTimeout(ctx, &a2aServer)
	if err != nil {
		return nil, err
	}
	defer cancel()

	content := ""
	if userInput.OfUser != nil && userInput.OfUser.Content.OfString.Value != "" {
		content = userInput.OfUser.Content.OfString.Value
	}

	queryName := getQueryName(ctx)
	modelID := fmt.Sprintf("agent/%s", agentName)

	if agentAnnotations[arkann.A2AStreamingSupported] == TrueString && eventStream != nil {
		result, err := e.executeStreaming(ctx, a2aAddress, a2aServer.Spec.Headers, namespace, content, agentName, queryName, contextID, modelID, eventStream, &a2aServer)
		if err != nil {
			StreamError(ctx, eventStream, err, "a2a_execution_failed", modelID)
			e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
			return nil, err
		}
		e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)
		return result, nil
	}

	// Query extension spec: ark/api/extensions/query/v1/
	a2aResponse, err := arka2a.ExecuteA2AAgent(ctx, e.client, a2aAddress, a2aServer.Spec.Headers, namespace, content, agentName, queryName, contextID, e.eventingRecorder, &a2aServer)
	if err != nil {
		StreamError(ctx, eventStream, err, "a2a_execution_failed", modelID)
		e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
		return nil, err
	}

	responseMessages := buildMessagesFromA2AResponse(a2aResponse)

	if eventStream != nil {
		streamBlockingA2AResponse(ctx, eventStream, a2aResponse, modelID)
	}

	e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)

	return &ExecutionResult{
		Messages:    responseMessages,
		A2AResponse: a2aResponse,
	}, nil
}

func streamBlockingA2AResponse(ctx context.Context, eventStream EventStreamInterface, resp *arka2a.A2AResponse, modelID string) {
	completionID := getQueryID(ctx)
	texts := resp.Messages
	if len(texts) == 0 {
		texts = []string{resp.Content}
	}
	for _, text := range texts {
		chunk := NewContentChunk(completionID, modelID, text)
		chunk.Choices[0].Delta.Role = RoleAssistant
		chunk.Choices[0].FinishReason = finishReasonStop
		chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
		if err := eventStream.StreamChunk(ctx, chunkWithMeta); err != nil {
			logf.FromContext(ctx).Error(err, "failed to send A2A response chunk to event stream")
		}
	}
}

func buildMessagesFromA2AResponse(resp *arka2a.A2AResponse) []Message {
	if len(resp.Messages) == 0 {
		return []Message{NewAssistantMessage(resp.Content)}
	}
	messages := make([]Message, 0, len(resp.Messages))
	for _, text := range resp.Messages {
		messages = append(messages, NewAssistantMessage(text))
	}
	return messages
}

func (e *A2AExecutionEngine) executeStreaming(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace, input, agentName, queryName, contextID, modelID string, eventStream EventStreamInterface, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, error) {
	rpcURL := strings.TrimSuffix(address, "/")

	a2aClient, err := arka2a.CreateA2AClient(ctx, e.client, rpcURL, headers, namespace, agentName, e.eventingRecorder)
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

const bareMessageStreamID = "__bare_message__"

type a2aArtifact struct {
	id     string
	name   string
	text   *strings.Builder
	isText bool
}

type a2aStreamContext struct {
	artifacts      map[string]*a2aArtifact
	artifactOrder  []string
	finalMsg       *strings.Builder
	bareMsg        *strings.Builder
	response       *arka2a.A2AResponse
	eventStream    EventStreamInterface
	completionID   string
	modelID        string
	agentName      string
	namespace      string
	queryName      string
	liveArtifactID string
	liveStarted    bool
}

func newA2AStreamContext(response *arka2a.A2AResponse, eventStream EventStreamInterface, completionID, modelID, agentName, namespace, queryName string) *a2aStreamContext {
	return &a2aStreamContext{
		artifacts:    make(map[string]*a2aArtifact),
		finalMsg:     &strings.Builder{},
		bareMsg:      &strings.Builder{},
		response:     response,
		eventStream:  eventStream,
		completionID: completionID,
		modelID:      modelID,
		agentName:    agentName,
		namespace:    namespace,
		queryName:    queryName,
	}
}

const defaultA2AExecutionTimeout = 5 * time.Minute

func resolveA2AExecutionTimeout(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer) (time.Duration, error) {
	if a2aServer != nil && a2aServer.Spec.Timeout != "" {
		timeout, err := time.ParseDuration(a2aServer.Spec.Timeout)
		if err != nil {
			return 0, fmt.Errorf("failed to parse A2AServer timeout %q: %w", a2aServer.Spec.Timeout, err)
		}
		return timeout, nil
	}
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return 0, nil
	}
	return defaultA2AExecutionTimeout, nil
}

func withA2AExecutionTimeout(ctx context.Context, a2aServer *arkv1prealpha1.A2AServer) (context.Context, context.CancelFunc, error) {
	timeout, err := resolveA2AExecutionTimeout(ctx, a2aServer)
	if err != nil {
		return nil, nil, err
	}
	if timeout <= 0 {
		ctx, cancel := context.WithCancel(ctx)
		return ctx, cancel, nil
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	return ctx, cancel, nil
}

func withDefaultExecutionTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, defaultA2AExecutionTimeout)
}

var defaultA2AStreamIdleTimeout = 8 * time.Minute

func effectiveIdleTimeout(a2aServer *arkv1prealpha1.A2AServer) time.Duration {
	if a2aServer != nil && a2aServer.Spec.Timeout != "" {
		if d, err := time.ParseDuration(a2aServer.Spec.Timeout); err == nil && d < defaultA2AStreamIdleTimeout {
			return d
		}
	}
	return defaultA2AStreamIdleTimeout
}

func consumeA2AStreamEvents(ctx context.Context, k8sClient client.Client, events <-chan protocol.StreamingMessageEvent, eventStream EventStreamInterface, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, error) {
	var response arka2a.A2AResponse
	received := false

	sc := newA2AStreamContext(&response, eventStream, completionID, modelID, agentName, namespace, queryName)

	idleTimeout := effectiveIdleTimeout(a2aServer)
	idleTimer := time.NewTimer(idleTimeout)
	defer idleTimer.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-idleTimer.C:
			return nil, fmt.Errorf("a2a streaming idle timeout: no events received for %s (agent=%s, namespace=%s)", idleTimeout, agentName, namespace)
		case event, ok := <-events:
			if !ok {
				if !received {
					return nil, fmt.Errorf("a2a streaming returned no events")
				}
				return buildA2AStreamResult(sc), nil
			}
			idleTimer.Reset(idleTimeout)
			received = true
			if event.Result == nil {
				continue
			}
			switch result := event.Result.(type) {
			case *protocol.Message:
				consumeA2AMessageEvent(ctx, result, sc)
			case *protocol.Task:
				consumeA2ATaskEvent(ctx, k8sClient, result, sc, a2aServer)
			case *protocol.TaskStatusUpdateEvent:
				if consumeA2AStatusUpdateEvent(ctx, result, sc) {
					return buildA2AStreamResult(sc), nil
				}
			case *protocol.TaskArtifactUpdateEvent:
				consumeA2AArtifactUpdateEvent(ctx, result, sc)
			}
		}
	}
}

func consumeA2AMessageEvent(ctx context.Context, msg *protocol.Message, sc *a2aStreamContext) {
	text := arka2a.ExtractTextFromParts(msg.Parts)
	if text != "" {
		sc.bareMsg.WriteString(text)
	}
	if msg.ContextID != nil && *msg.ContextID != "" {
		sc.response.ContextID = *msg.ContextID
	}
	if text != "" {
		sc.streamLiveText(ctx, bareMessageStreamID, text)
	}
}

func consumeA2ATaskEvent(ctx context.Context, k8sClient client.Client, task *protocol.Task, sc *a2aStreamContext, a2aServer *arkv1prealpha1.A2AServer) {
	sc.response.TaskID = task.ID
	sc.response.ContextID = task.ContextID
	for i := range task.Artifacts {
		sc.mergeArtifact(task.Artifacts[i])
	}
	if len(arka2a.ArtifactTexts(task.Artifacts)) == 0 {
		if texts := arka2a.TaskReplyTexts(task); len(texts) > 0 {
			sc.finalMsg.Reset()
			sc.finalMsg.WriteString(strings.Join(texts, "\n"))
		}
	}
	maybeCreateA2ATask(ctx, k8sClient, task, sc.agentName, sc.namespace, sc.queryName, a2aServer)
}

func consumeA2AStatusUpdateEvent(ctx context.Context, event *protocol.TaskStatusUpdateEvent, sc *a2aStreamContext) bool {
	if sc.response.TaskID == "" {
		sc.response.TaskID = event.TaskID
	}
	if sc.response.ContextID == "" {
		sc.response.ContextID = event.ContextID
	}
	var text string
	if event.Status.Message != nil {
		text = arka2a.ExtractTextFromParts(event.Status.Message.Parts)
	}
	if event.Final {
		if text != "" {
			sc.finalMsg.Reset()
			sc.finalMsg.WriteString(text)
		}
		return true
	}
	StreamA2AStatus(ctx, sc.eventStream, event.TaskID, string(event.Status.State), text, sc.agentName)
	return false
}

func consumeA2AArtifactUpdateEvent(ctx context.Context, event *protocol.TaskArtifactUpdateEvent, sc *a2aStreamContext) {
	if sc.response.TaskID == "" {
		sc.response.TaskID = event.TaskID
	}
	id := event.Artifact.ArtifactID
	art := sc.getOrCreateArtifact(id)
	if event.Artifact.Name != nil && *event.Artifact.Name != "" {
		art.name = *event.Artifact.Name
	}
	text := arka2a.ExtractTextFromParts(event.Artifact.Parts)
	appendChunk := event.Append != nil && *event.Append
	if appendChunk {
		art.text.WriteString(text)
	} else {
		art.text.Reset()
		art.text.WriteString(text)
	}
	if art.text.Len() > 0 {
		art.isText = true
	}
	if text != "" {
		sc.streamLiveText(ctx, id, text)
	}
}

func (sc *a2aStreamContext) getOrCreateArtifact(id string) *a2aArtifact {
	art, exists := sc.artifacts[id]
	if !exists {
		art = &a2aArtifact{id: id, text: &strings.Builder{}}
		sc.artifacts[id] = art
		sc.artifactOrder = append(sc.artifactOrder, id)
	}
	return art
}

func (sc *a2aStreamContext) mergeArtifact(artifact protocol.Artifact) {
	text := arka2a.ExtractTextFromParts(artifact.Parts)
	if text == "" {
		return
	}
	art := sc.getOrCreateArtifact(artifact.ArtifactID)
	if artifact.Name != nil && *artifact.Name != "" {
		art.name = *artifact.Name
	}
	art.text.Reset()
	art.text.WriteString(text)
	art.isText = true
}

func (sc *a2aStreamContext) streamLiveText(ctx context.Context, streamID, text string) {
	if sc.eventStream == nil {
		return
	}
	if sc.liveStarted && sc.liveArtifactID != streamID {
		StreamContentBoundary(ctx, sc.eventStream, sc.completionID, sc.modelID)
	}
	sc.liveArtifactID = streamID
	sc.liveStarted = true
	streamContentChunk(ctx, sc.eventStream, sc.completionID, sc.modelID, text)
}

func (sc *a2aStreamContext) artifactReplyTexts() []string {
	artifacts := make([]protocol.Artifact, 0, len(sc.artifactOrder))
	for _, id := range sc.artifactOrder {
		art := sc.artifacts[id]
		if art == nil || !art.isText {
			continue
		}
		var namePtr *string
		if art.name != "" {
			name := art.name
			namePtr = &name
		}
		artifacts = append(artifacts, protocol.Artifact{
			ArtifactID: art.id,
			Name:       namePtr,
			Parts:      []protocol.Part{protocol.NewTextPart(art.text.String())},
		})
	}
	return arka2a.ArtifactTexts(artifacts)
}

func buildA2AStreamResult(sc *a2aStreamContext) *ExecutionResult {
	texts := sc.artifactReplyTexts()
	if len(texts) == 0 {
		if sc.finalMsg.Len() > 0 {
			texts = []string{sc.finalMsg.String()}
		} else if sc.bareMsg.Len() > 0 {
			texts = []string{sc.bareMsg.String()}
		}
	}

	sc.response.Content = strings.Join(texts, "\n")
	sc.response.Messages = texts

	messages := make([]Message, 0, len(texts))
	for _, text := range texts {
		messages = append(messages, NewAssistantMessage(text))
	}
	if len(messages) == 0 {
		messages = []Message{NewAssistantMessage("")}
	}

	return &ExecutionResult{
		Messages:    messages,
		A2AResponse: sc.response,
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

func maybeCreateA2ATask(ctx context.Context, k8sClient client.Client, task *protocol.Task, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) {
	if a2aServer == nil || queryName == "" {
		return
	}
	_ = arka2a.HandleA2ATaskResponse(ctx, k8sClient, task, agentName, namespace, queryName, a2aServer)
}
