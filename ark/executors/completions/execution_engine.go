/* Copyright 2025. McKinsey & Company */

package completions

import (
	"context"
	"fmt"
	"strings"

	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing"
)

// NamedExecutionEngine dispatches a single agent to an external ExecutionEngine
// over A2A, carrying the Ark query extension so the engine can resolve the agent
// from the cluster itself.
//
// Query extension spec: ark/api/extensions/query/v1/
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

// dispatchesToEngine reports whether an agent will be dispatched over A2A rather
// than executed by the local agentic loop. MakeAgent and executeAgent both use it
// so that model loading and execution routing can never disagree.
func dispatchesToEngine(ctx context.Context, ref *arkv1alpha1.ExecutionEngineRef, agentName string) bool {
	if ref == nil {
		return false
	}
	if !arka2a.IsNamedEngine(ref) {
		return true
	}
	// This engine was handed this agent explicitly; running it locally is what
	// terminates the chain.
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

	operationData := map[string]string{
		"executionEngine": req.EngineRef.Name,
		"engineAddr":      address,
		"protocol":        "a2a-jsonrpc",
	}
	ctx = e.eventingRecorder.Start(ctx, "ExecutionEngineExecution", fmt.Sprintf("Executing agent %s on execution engine %s", req.AgentName, req.EngineRef.Name), operationData)

	modelID := fmt.Sprintf("agent/%s", req.AgentName)

	// No A2AServer here: a nil server inherits the caller's deadline when one is
	// set (the query timeout applied by the controller), else the default.
	ctx, cancel, err := withA2AExecutionTimeout(ctx, nil)
	if err != nil {
		return nil, err
	}
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

	// streamBlockingA2AResponse does not guard against a nil stream, and a
	// sub-target invocation deliberately has none.
	if req.EventStream != nil {
		streamBlockingA2AResponse(ctx, req.EventStream, a2aResponse, modelID)
	}

	e.eventingRecorder.Complete(ctx, "ExecutionEngineExecution", "Execution engine execution completed successfully", operationData)

	return &ExecutionResult{
		Messages:    []Message{NewAssistantMessage(a2aResponse.Content)},
		A2AResponse: a2aResponse,
	}, nil
}

// renderEngineInput folds the accumulated team transcript into the text sent to
// an execution engine. Engines receive only a QueryRef over the wire, and a
// team's intra-run messages are not written to memory until the query completes,
// so without this a sequential team's members would never see each other's
// output. Returns the bare user text when there is no history, keeping
// single-agent dispatch unchanged.
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

// renderEngineHistory renders history for an execution engine. It matches
// buildHistory's format for user and assistant messages, and additionally
// renders system messages, which carry instructions the engine must see — a
// team selector passes its entire prompt (roles, participants, transcript) as a
// system message, and dropping it leaves the engine nothing to select from.
//
// buildHistory itself is deliberately left alone: it also renders the local
// selector's {{.History}}, where team transcripts legitimately accumulate system
// messages (selection warnings, the max-turns notice) that have never been shown
// to a selector and should not start appearing now.
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
