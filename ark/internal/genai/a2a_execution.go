/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/openai/openai-go"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arkann "mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
)

// A2AExecutionEngine handles execution for agents with the reserved 'a2a' execution engine
type A2AExecutionEngine struct {
	client           client.Client
	eventingRecorder eventing.A2aRecorder
}

// NewA2AExecutionEngine creates a new A2A execution engine
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

	// Get the A2A server address from annotations
	a2aAddress, hasAddress := agentAnnotations[arkann.A2AServerAddress]
	if !hasAddress {
		return nil, fmt.Errorf("A2A agent missing %s annotation", arkann.A2AServerAddress)
	}

	// Get the A2AServer name from annotations
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

	// Check if A2AServer has a timeout configured
	if a2aServer.Spec.Timeout != "" {
		timeout, err := time.ParseDuration(a2aServer.Spec.Timeout)
		if err != nil {
			return nil, fmt.Errorf("failed to parse A2AServer timeout %q: %w", a2aServer.Spec.Timeout, err)
		}
		// Create sub-context with A2AServer timeout
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	// Otherwise, use existing context deadline from query

	queryName := getQueryName(ctx)
	includeHistory := shouldIncludeA2AHistory(agentAnnotations, false)
	metadata, err := buildA2AMetadata(agentAnnotations, history, includeHistory)
	if err != nil {
		return nil, err
	}
	payloadMode := getA2APayloadMode(agentAnnotations)

	if isA2AStreamingEnabled(agentAnnotations) {
		if isA2AStreamingSupported(agentAnnotations) {
			streamResult, streamErr := e.streamA2AExecution(ctx, a2aAddress, a2aServer.Spec.Headers, namespace, agentName, queryName, contextID, userInput, metadata, eventStream, payloadMode, &a2aServer)
			if streamErr == nil {
				e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)
				return streamResult, nil
			}
			log.Error(streamErr, "A2A streaming execution failed, falling back to blocking", "agent", agentName)
		} else {
			log.Info("A2A streaming not supported by agent", "agent", agentName)
		}
	}

	a2aResponse, err := ExecuteA2AAgent(ctx, e.client, a2aAddress, a2aServer.Spec.Headers, namespace, userInput, metadata, agentName, queryName, contextID, e.eventingRecorder, &a2aServer)
	if err != nil {
		modelID := fmt.Sprintf("agent/%s", agentName)
		streamA2AError(ctx, eventStream, payloadMode, modelID, err)
		e.eventingRecorder.Fail(ctx, "A2AExecution", fmt.Sprintf("A2A execution failed: %v", err), err, operationData)
		return nil, err
	}

	responseMessage := NewAssistantMessage(a2aResponse.Content)

	if eventStream != nil {
		completionID := getQueryID(ctx)
		modelID := fmt.Sprintf("agent/%s", agentName)
		if payloadMode == a2aPayloadModeNative {
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
		} else {
			chunk := &openai.ChatCompletionChunk{
				ID:      completionID,
				Object:  "chat.completion.chunk",
				Created: time.Now().Unix(),
				Model:   modelID,
				Choices: []openai.ChatCompletionChunkChoice{
					{
						Index: 0,
						Delta: openai.ChatCompletionChunkChoiceDelta{
							Content: a2aResponse.Content,
							Role:    "assistant",
						},
						FinishReason: "stop",
					},
				},
			}
			chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, modelID, nil)
			if err := eventStream.StreamChunk(ctx, chunkWithMeta); err != nil {
				log.Error(err, "failed to send A2A response chunk to event stream")
			}
		}
	}

	e.eventingRecorder.Complete(ctx, "A2AExecution", "A2A execution completed successfully", operationData)

	return &ExecutionResult{
		Messages:    []Message{responseMessage},
		A2AResponse: a2aResponse,
	}, nil
}

func (e *A2AExecutionEngine) streamA2AExecution(ctx context.Context, address string, headers []arkv1prealpha1.Header, namespace, agentName, queryName, contextID string, userInput Message, metadata map[string]interface{}, eventStream EventStreamInterface, payloadMode string, a2aServer *arkv1prealpha1.A2AServer) (*ExecutionResult, error) {
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
	responseMessage := NewAssistantMessage(response.Content)
	return &ExecutionResult{
		Messages:    []Message{responseMessage},
		A2AResponse: response,
	}, nil
}

func (e *A2AExecutionEngine) consumeA2AStreamEvents(ctx context.Context, events <-chan protocol.StreamingMessageEvent, eventStream EventStreamInterface, payloadMode, modelID, completionID, agentName, namespace, queryName string, a2aServer *arkv1prealpha1.A2AServer) (*A2AResponse, error) {
	response := &A2AResponse{}
	var finalContent strings.Builder
	var latestTask *protocol.Task
	var lastStatus *protocol.TaskStatus
	received := false
	done := false
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case event, ok := <-events:
			if !ok {
				if !received {
					return nil, fmt.Errorf("a2a streaming returned no events")
				}
				if latestTask != nil {
					if text, textErr := extractTextFromTask(latestTask); textErr == nil && text != "" {
						finalContent.Reset()
						finalContent.WriteString(text)
					}
				}
				response.Content = finalContent.String()
				return response, nil
			}
			received = true
			if event.Result == nil {
				continue
			}
			switch result := event.Result.(type) {
			case *protocol.Message:
				text := extractTextFromParts(result.Parts)
				if text != "" {
					finalContent.WriteString(text)
				}
				if result.ContextID != nil && *result.ContextID != "" {
					response.ContextID = *result.ContextID
				}
				if result.TaskID != nil && *result.TaskID != "" {
					response.TaskID = *result.TaskID
				}
				streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, text, result)
				done = true
			case *protocol.Task:
				latestTask = result
				response.TaskID = result.ID
				response.ContextID = result.ContextID
				lastStatus = &result.Status
				if a2aServer != nil {
					_ = upsertA2ATaskFromTask(ctx, e.client, result, agentName, namespace, queryName, a2aServer.Name)
				}
				streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, "", result)
			case *protocol.TaskStatusUpdateEvent:
				lastStatus = &result.Status
				if response.TaskID == "" {
					response.TaskID = result.TaskID
				}
				if response.ContextID == "" {
					response.ContextID = result.ContextID
				}
				task := taskFromStatusUpdate(result)
				if a2aServer != nil {
					_ = upsertA2ATaskFromTask(ctx, e.client, task, agentName, namespace, queryName, a2aServer.Name)
				}
				if result.Final && result.Status.Message != nil && finalContent.Len() == 0 {
					text := extractTextFromParts(result.Status.Message.Parts)
					if text != "" {
						finalContent.WriteString(text)
					}
				}
				streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, "", result)
				if result.Final {
					done = true
				}
			case *protocol.TaskArtifactUpdateEvent:
				if response.TaskID == "" {
					response.TaskID = result.TaskID
				}
				if response.ContextID == "" {
					response.ContextID = result.ContextID
				}
				text := extractTextFromParts(result.Artifact.Parts)
				if text != "" {
					finalContent.WriteString(text)
				}
				task := taskFromArtifactUpdate(result, lastStatus)
				if a2aServer != nil {
					_ = upsertA2ATaskFromTask(ctx, e.client, task, agentName, namespace, queryName, a2aServer.Name)
				}
				streamA2AEvent(ctx, eventStream, payloadMode, modelID, completionID, text, result)
			}
			if done {
				if latestTask != nil {
					if text, textErr := extractTextFromTask(latestTask); textErr == nil && text != "" {
						finalContent.Reset()
						finalContent.WriteString(text)
					}
				}
				response.Content = finalContent.String()
				return response, nil
			}
		}
	}
}

func streamA2AEvent(ctx context.Context, eventStream EventStreamInterface, payloadMode, modelID, completionID, content string, payload interface{}) {
	if eventStream == nil {
		return
	}
	if payloadMode == a2aPayloadModeNative {
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
	if payloadMode == a2aPayloadModeNative {
		message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart(err.Error()),
		})
		streamA2AEvent(ctx, eventStream, payloadMode, modelID, getQueryID(ctx), err.Error(), &message)
		return
	}
	StreamError(ctx, eventStream, err, "a2a_execution_failed", modelID)
}
