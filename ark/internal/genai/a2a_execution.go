/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"fmt"
	"time"

	"github.com/openai/openai-go"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arkann "mckinsey.com/ark/internal/annotations"
)

// A2AExecutionEngine handles execution for agents with the reserved 'a2a' execution engine
type A2AExecutionEngine struct {
	client   client.Client
	recorder EventEmitter
}

// NewA2AExecutionEngine creates a new A2A execution engine
func NewA2AExecutionEngine(k8sClient client.Client, recorder EventEmitter) *A2AExecutionEngine {
	return &A2AExecutionEngine{
		client:   k8sClient,
		recorder: recorder,
	}
}

// Execute executes a query against an A2A agent
func (e *A2AExecutionEngine) Execute(ctx context.Context, agentName, namespace string, agentAnnotations map[string]string, contextID string, userInput Message, eventStream EventStreamInterface) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	log.Info("executing A2A agent", "agent", agentName)

	a2aTracker := NewOperationTracker(e.recorder, ctx, "A2ACall", agentName, map[string]string{
		"a2aServer":  agentAnnotations[arkann.A2AServerName],
		"serverAddr": agentAnnotations[arkann.A2AServerAddress],
		"queryId":    getQueryID(ctx),
		"sessionId":  getSessionID(ctx),
		"protocol":   "a2a-jsonrpc",
		"namespace":  namespace,
	})

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

	// Extract content from the userInput message
	content := ""
	if userInput.OfUser != nil && userInput.OfUser.Content.OfString.Value != "" {
		content = userInput.OfUser.Content.OfString.Value
	}

	// Execute A2A agent with event recording
	queryName := getQueryName(ctx)
	a2aResponse, err := ExecuteA2AAgent(ctx, e.client, a2aAddress, a2aServer.Spec.Headers, namespace, content, agentName, queryName, contextID, nil, &a2aServer)
	if err != nil {
		a2aTracker.Fail(err)
		e.recorder.EmitEvent(ctx, "Warning", "A2AExecutionFailed", BaseEvent{
			Name: "A2AAgentExecutionFailed",
			Metadata: map[string]string{
				"agent":     agentName,
				"namespace": namespace,
				"error":     err.Error(),
				"a2aServer": a2aServerName,
				"address":   a2aAddress,
			},
		})

		modelID := fmt.Sprintf("agent/%s", agentName)
		StreamError(ctx, eventStream, err, "a2a_execution_failed", modelID)

		return nil, err
	}

	// Emit success event
	e.recorder.EmitEvent(ctx, "Normal", "A2AExecutionSuccess", BaseEvent{
		Name: "A2AAgentExecutionCompleted",
		Metadata: map[string]string{
			"agent":          agentName,
			"namespace":      namespace,
			"responseLength": fmt.Sprintf("%d", len(a2aResponse.Content)),
			"a2aServer":      a2aServerName,
			"address":        a2aAddress,
			"hasError":       "false",
		},
	})

	a2aTracker.CompleteWithMetadata(a2aResponse.Content, map[string]string{
		"responseLength": fmt.Sprintf("%d", len(a2aResponse.Content)),
		"hasError":       "false",
		"messageCount":   "1",
	})

	// Convert response to genai.Message format
	responseMessage := NewAssistantMessage(a2aResponse.Content)

	// The A2A execution engine does not yet support streaming responses - if streaming
	// was requested then the final response must be sent as a single chunk, as per the spec.
	if eventStream != nil {
		// Use query ID as completion ID (all chunks for a query share the same ID)
		completionID := getQueryID(ctx)
		// Use "agent/name" format as per OpenAI-compatible endpoints
		modelID := fmt.Sprintf("agent/%s", agentName)

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

	return &ExecutionResult{
		Messages:    []Message{responseMessage},
		A2AResponse: a2aResponse,
	}, nil
}
