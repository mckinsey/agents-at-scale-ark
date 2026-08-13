/* Copyright 2025. McKinsey & Company */

package completions

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing"
)

type NamedExecutionEngine struct {
	client           client.Client
	eventingRecorder eventing.A2aRecorder
}

func NewNamedExecutionEngine(k8sClient client.Client, eventingRecorder eventing.A2aRecorder) *NamedExecutionEngine {
	return &NamedExecutionEngine{
		client:           k8sClient,
		eventingRecorder: eventingRecorder,
	}
}

func dispatchesToEngine(ctx context.Context, ref *arkv1alpha1.ExecutionEngineRef, agentName string) bool {
	if ref == nil {
		return false
	}
	if !arka2a.IsNamedEngine(ref) {
		return true
	}
	return GetSubTargetAgent(ctx) != agentName
}

type NamedEngineRequest struct {
	AgentName   string
	Namespace   string
	EngineRef   *arkv1alpha1.ExecutionEngineRef
	ContextID   string
	UserInput   Message
	History     []Message
	EventStream EventStreamInterface
}

func (e *NamedExecutionEngine) Execute(ctx context.Context, req NamedEngineRequest) (*ExecutionResult, error) {
	log := logf.FromContext(ctx)
	log.Info("executing agent on execution engine", "agent", req.AgentName, "engine", req.EngineRef.Name)

	query, ok := ctx.Value(QueryContextKey).(*arkv1alpha1.Query)
	if !ok {
		return nil, fmt.Errorf("missing query context for agent %s/%s", req.Namespace, req.AgentName)
	}

	address, engineCRD, err := arka2a.ResolveExecutionEngineAddress(ctx, e.client, req.EngineRef, req.Namespace)
	if err != nil {
		return nil, err
	}

	conversationID := deriveMemberConversationID(req.ContextID, query.Namespace, query.Name, req.AgentName)

	operationData := map[string]string{
		"executionEngine": req.EngineRef.Name,
		"engineAddr":      address,
		"protocol":        "a2a-jsonrpc",
		"conversationId":  conversationID,
	}
	ctx = e.eventingRecorder.Start(ctx, "ExecutionEngineExecution", fmt.Sprintf("Executing agent %s on execution engine %s", req.AgentName, req.EngineRef.Name), operationData)

	modelID := fmt.Sprintf("agent/%s", req.AgentName)

	ctx, cancel := withDefaultExecutionTimeout(ctx)
	defer cancel()

	message := arka2a.NewQueryExtensionMessage(
		renderEngineInput(req.UserInput, req.History),
		req.ContextID,
		arka2a.QueryExtensionRef{
			Name:      query.Name,
			Namespace: query.Namespace,
			Target: &arka2a.QueryExtensionTarget{
				Type: ToolTypeAgent,
				Name: req.AgentName,
			},
			ConversationID: conversationID,
		},
	)

	result, err := arka2a.SendQueryExtensionMessage(ctx, e.client, address, nil, req.Namespace, req.AgentName, message, e.eventingRecorder)
	if err != nil {
		err = fmt.Errorf("execution engine %s call failed: %w", req.EngineRef.Name, err)
		StreamError(ctx, req.EventStream, err, "execution_engine_failed", modelID)
		e.eventingRecorder.Fail(ctx, "ExecutionEngineExecution", fmt.Sprintf("Execution engine call failed: %v", err), err, operationData)
		return nil, err
	}

	a2aResponse, err := arka2a.ExtractResponseFromMessageResult(ctx, e.client, result, req.AgentName, req.Namespace, query.Name, engineCRD)
	if err != nil {
		StreamError(ctx, req.EventStream, err, "execution_engine_failed", modelID)
		e.eventingRecorder.Fail(ctx, "ExecutionEngineExecution", fmt.Sprintf("Execution engine response invalid: %v", err), err, operationData)
		return nil, err
	}

	if req.EventStream != nil {
		streamBlockingA2AResponse(ctx, req.EventStream, a2aResponse, modelID)
	}

	e.eventingRecorder.Complete(ctx, "ExecutionEngineExecution", "Execution engine execution completed successfully", operationData)

	return &ExecutionResult{
		Messages:    []Message{NewAssistantMessage(a2aResponse.Content)},
		A2AResponse: a2aResponse,
	}, nil
}

func deriveMemberConversationID(parentContextID, namespace, queryName, agentName string) string {
	base := parentContextID
	if base == "" {
		base = queryName
	}

	sum := sha256.Sum256([]byte(namespace + "\x00" + base + "\x00" + agentName))
	return hex.EncodeToString(sum[:16])
}

func renderEngineInput(userInput Message, history []Message) string {
	content := ""
	if userInput.OfUser != nil {
		content = userInput.OfUser.Content.OfString.Value
	}

	transcript := renderEngineHistory(history)
	if transcript == "" {
		return content
	}

	return fmt.Sprintf("%s\n\n%s", transcript, content)
}

func renderEngineHistory(messages []Message) string {
	var rendered []string
	for _, msg := range messages {
		switch {
		case msg.OfSystem != nil:
			rendered = append(rendered, fmt.Sprintf("# system:\n%s\n", msg.OfSystem.Content.OfString))
		case msg.OfAssistant != nil:
			rendered = append(rendered, fmt.Sprintf("# %s:\n%s\n", msg.OfAssistant.Name.Value, msg.OfAssistant.Content.OfString))
		case msg.OfUser != nil:
			rendered = append(rendered, fmt.Sprintf("# user:\n%s\n", msg.OfUser.Content.OfString))
		}
	}
	return strings.Join(rendered, "\n")
}
