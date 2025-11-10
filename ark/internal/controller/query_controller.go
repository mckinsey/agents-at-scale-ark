/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/openai/openai-go"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
)

type targetResult struct {
	messages []genai.Message
	err      error
	target   arkv1alpha1.QueryTarget
}

// QueryReconciler reconciles a Query object with telemetry abstraction.
//
// Telemetry Pattern:
// - QueryRecorder is injected at controller creation (see cmd/main.go)
// - Use QueryRecorder.StartQuery() for session-level spans
// - Use QueryRecorder.StartTarget() for target-specific spans
// - Record inputs, outputs, errors, and token usage through QueryRecorder methods
// - Never import OTEL packages directly - use the abstraction layer
type QueryReconciler struct {
	client.Client
	Scheme     *runtime.Scheme
	Recorder   record.EventRecorder
	Telemetry  *telemetryconfig.Provider
	operations sync.Map
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list
// +kubebuilder:rbac:groups="",resources=events,verbs=create;list;watch;patch
// +kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=impersonate

func (r *QueryReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	obj, err := r.fetchQuery(ctx, req.NamespacedName)
	if err != nil {
		if client.IgnoreNotFound(err) != nil {
			log.Error(err, "unable to fetch Query")
		}
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	expiry := obj.CreationTimestamp.Add(obj.Spec.TTL.Duration)
	if time.Now().After(expiry) {
		// TTL expired: delete the object
		if err := r.Delete(ctx, &obj); err != nil {
			log.Error(err, "unable to delete object")
			return ctrl.Result{}, err
		}
	}

	if result, err := r.handleFinalizer(ctx, &obj); result != nil {
		return *result, err
	}

	if len(obj.Status.Conditions) == 0 {
		r.setConditionCompleted(&obj, metav1.ConditionFalse, "QueryNotStarted", "The query has not been started yet")
		return ctrl.Result{}, r.Status().Update(ctx, &obj)
	}

	return r.handleQueryExecution(ctx, req, obj)
}

func (r *QueryReconciler) fetchQuery(ctx context.Context, namespacedName types.NamespacedName) (arkv1alpha1.Query, error) {
	var obj arkv1alpha1.Query
	err := r.Get(ctx, namespacedName, &obj)
	return obj, err
}

func (r *QueryReconciler) handleFinalizer(ctx context.Context, obj *arkv1alpha1.Query) (*ctrl.Result, error) {
	if obj.DeletionTimestamp.IsZero() {
		if !controllerutil.ContainsFinalizer(obj, finalizer) {
			controllerutil.AddFinalizer(obj, finalizer)
			return &ctrl.Result{}, r.Update(ctx, obj)
		}
		return nil, nil
	}

	if controllerutil.ContainsFinalizer(obj, finalizer) {
		r.finalize(ctx, obj)
		controllerutil.RemoveFinalizer(obj, finalizer)
		return &ctrl.Result{}, r.Update(ctx, obj)
	}

	return &ctrl.Result{}, nil
}

func (r *QueryReconciler) handleQueryExecution(ctx context.Context, req ctrl.Request, obj arkv1alpha1.Query) (ctrl.Result, error) {
	expiry := obj.CreationTimestamp.Add(obj.Spec.TTL.Duration)

	if obj.Spec.Cancel && obj.Status.Phase != statusCanceled {
		r.cleanupExistingOperation(req.NamespacedName)
		if err := r.updateStatus(ctx, &obj, statusCanceled); err != nil {
			return ctrl.Result{
				RequeueAfter: time.Until(expiry),
			}, err
		}
		return ctrl.Result{}, nil
	}

	switch obj.Status.Phase {
	case statusDone, statusError, statusCanceled:
		return ctrl.Result{
			RequeueAfter: time.Until(expiry),
		}, nil
	case statusRunning:
		return r.handleRunningPhase(ctx, req, obj)
	default:
		if err := r.updateStatus(ctx, &obj, statusRunning); err != nil {
			return ctrl.Result{
				RequeueAfter: time.Until(expiry),
			}, err
		}
		return ctrl.Result{}, nil
	}
}

func (r *QueryReconciler) handleRunningPhase(ctx context.Context, req ctrl.Request, obj arkv1alpha1.Query) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if _, exists := r.operations.Load(req.NamespacedName); exists {
		log.Info("Exists")
		return ctrl.Result{}, nil
	}

	opCtx, cancel := context.WithCancel(ctx)
	r.operations.Store(req.NamespacedName, cancel)
	recorder := genai.NewQueryRecorder(&obj, r.Recorder)
	tokenCollector := genai.NewTokenUsageCollector(recorder)

	queryTracker := genai.NewOperationTracker(tokenCollector, opCtx, "QueryResolve", obj.Name, map[string]string{
		"namespace": obj.Namespace,
		"targets":   fmt.Sprintf("%d", len(obj.Spec.Targets)),
	})

	go r.executeQueryAsync(opCtx, obj, req.NamespacedName, queryTracker, tokenCollector)
	return ctrl.Result{}, nil
}

func (r *QueryReconciler) executeQueryAsync(opCtx context.Context, obj arkv1alpha1.Query, namespacedName types.NamespacedName, queryTracker *genai.OperationTracker, tokenCollector *genai.TokenUsageCollector) {
	log := logf.FromContext(opCtx)
	cleanupCache := true
	startTime := time.Now()

	defer func() {
		if r := recover(); r != nil {
			log.Error(fmt.Errorf("query execution goroutine panic: %v", r), "Query execution goroutine panicked")
		}
		if cleanupCache {
			r.operations.Delete(namespacedName)
		}
	}()

	// Start session-aware query tracing using new abstraction
	sessionId := obj.Spec.SessionId
	if sessionId == "" {
		sessionId = string(obj.UID)
	}

	// Create query execution span with session tracking.
	// This span represents the entire query lifecycle and includes:
	// - Session correlation for multi-query conversations
	// - Token usage aggregation across all targets
	opCtx, span := r.Telemetry.QueryRecorder().StartQuery(opCtx, obj.Name, obj.Namespace, "execute")
	r.Telemetry.QueryRecorder().RecordSessionID(span, sessionId)
	defer span.End()

	impersonatedClient, memory, err := r.setupQueryExecution(opCtx, obj, queryTracker, tokenCollector, sessionId)
	if err != nil {
		r.Telemetry.QueryRecorder().RecordError(span, err)
		return
	}

	inputMessages, err := genai.GetQueryInputMessages(opCtx, obj, impersonatedClient)
	if err == nil {
		queryInput := genai.ExtractUserMessageContent(inputMessages)
		r.Telemetry.QueryRecorder().RecordRootInput(span, queryInput)
	}

	responses, eventStream, err := r.reconcileQueue(opCtx, obj, impersonatedClient, memory, tokenCollector)
	if err != nil {
		queryTracker.Fail(err)
		r.Telemetry.QueryRecorder().RecordError(span, err)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	queryTracker.Complete("resolved")
	obj.Status.Responses = responses

	if len(responses) > 0 && responses[0].Phase == statusDone {
		r.Telemetry.QueryRecorder().RecordRootOutput(span, responses[0].Content)
	}

	tokenSummary := tokenCollector.GetTokenSummary()
	obj.Status.TokenUsage = arkv1alpha1.TokenUsage{
		PromptTokens:     tokenSummary.PromptTokens,
		CompletionTokens: tokenSummary.CompletionTokens,
		TotalTokens:      tokenSummary.TotalTokens,
	}

	// Record token usage in telemetry span
	r.Telemetry.QueryRecorder().RecordTokenUsage(span, tokenSummary.PromptTokens, tokenSummary.CompletionTokens, tokenSummary.TotalTokens)

	// Set overall query status based on whether any targets failed
	queryStatus := r.determineQueryStatus(responses)
	_ = r.updateStatus(opCtx, &obj, queryStatus)

	duration := &metav1.Duration{Duration: time.Since(startTime)}
	r.finalizeEventStream(opCtx, eventStream)
	_ = r.updateStatusWithDuration(opCtx, &obj, queryStatus, duration)

	// Mark span as successful
	r.Telemetry.QueryRecorder().RecordSuccess(span)
}

// finalizeEventStream sends the completion message to the event stream and
// closes its connection.
func (r *QueryReconciler) finalizeEventStream(ctx context.Context, eventStream genai.EventStreamInterface) {
	if eventStream == nil {
		return
	}

	log := logf.FromContext(ctx)

	// Notify event stream that streaming is complete. This ensures that
	// clients connected to the stream receive the completion event and
	// will close their connection.
	if completionErr := eventStream.NotifyCompletion(ctx); completionErr != nil {
		// If we cannot close the event stream, log and error but don't
		// fail - the final message will still be available in the
		// query response.
		log.Error(completionErr, "Failed to notify query completion to event stream")
	}

	// Close the event stream. If this fails, we log and error but don't
	// fail the query, as the final message is still recorded.
	if closeErr := eventStream.Close(); closeErr != nil {
		log.Error(closeErr, "Failed to close event stream")
	}
}

func (r *QueryReconciler) setupQueryExecution(opCtx context.Context, obj arkv1alpha1.Query, queryTracker *genai.OperationTracker, tokenCollector *genai.TokenUsageCollector, sessionId string) (client.Client, genai.MemoryInterface, error) {
	impersonatedClient, err := r.getClientForQuery(obj)
	if err != nil {
		queryTracker.Fail(fmt.Errorf("failed to create impersonated client: %w", err))
		_ = r.updateStatus(opCtx, &obj, statusError)
		return nil, nil, err
	}

	memory, err := genai.NewMemoryForQuery(opCtx, impersonatedClient, obj.Spec.Memory, obj.Namespace, tokenCollector, sessionId, obj.Name)
	if err != nil {
		queryTracker.Fail(fmt.Errorf("failed to create memory client: %w", err))
		_ = r.updateStatus(opCtx, &obj, statusError)
		return nil, nil, err
	}

	return impersonatedClient, memory, nil
}

func (r *QueryReconciler) resolveTargets(ctx context.Context, query arkv1alpha1.Query, impersonatedClient client.Client) ([]arkv1alpha1.QueryTarget, error) {
	var allTargets []arkv1alpha1.QueryTarget

	allTargets = append(allTargets, query.Spec.Targets...)

	if query.Spec.Selector != nil {
		targets, err := r.resolveSelector(ctx, query.Spec.Selector, query.Namespace, impersonatedClient)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve selector: %w", err)
		}
		allTargets = append(allTargets, targets...)
	}

	return allTargets, nil
}

func (r *QueryReconciler) resolveSelector(ctx context.Context, selector *metav1.LabelSelector, namespace string, impersonatedClient client.Client) ([]arkv1alpha1.QueryTarget, error) {
	targets := make([]arkv1alpha1.QueryTarget, 0, 10)

	labelSelector, err := metav1.LabelSelectorAsSelector(selector)
	if err != nil {
		return nil, fmt.Errorf("invalid label selector: %w", err)
	}

	// Search for agents
	var agentList arkv1alpha1.AgentList
	if err := impersonatedClient.List(ctx, &agentList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list agents: %w", err)
	}

	for _, agent := range agentList.Items {
		targets = append(targets, arkv1alpha1.QueryTarget{
			Type: "agent",
			Name: agent.Name,
		})
	}

	// Search for teams
	var teamList arkv1alpha1.TeamList
	if err := impersonatedClient.List(ctx, &teamList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list teams: %w", err)
	}

	for _, team := range teamList.Items {
		targets = append(targets, arkv1alpha1.QueryTarget{
			Type: "team",
			Name: team.Name,
		})
	}

	// Search for models
	var modelList arkv1alpha1.ModelList
	if err := impersonatedClient.List(ctx, &modelList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list models: %w", err)
	}

	for _, model := range modelList.Items {
		targets = append(targets, arkv1alpha1.QueryTarget{
			Type: "model",
			Name: model.Name,
		})
	}

	// Search for tools
	var toolList arkv1alpha1.ToolList
	if err := impersonatedClient.List(ctx, &toolList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list tools: %w", err)
	}

	for _, tool := range toolList.Items {
		targets = append(targets, arkv1alpha1.QueryTarget{
			Type: "tool",
			Name: tool.Name,
		})
	}

	return targets, nil
}

func (r *QueryReconciler) reconcileQueue(ctx context.Context, query arkv1alpha1.Query, impersonatedClient client.Client, memory genai.MemoryInterface, tokenCollector *genai.TokenUsageCollector) ([]arkv1alpha1.Response, genai.EventStreamInterface, error) {
	eventStream, err := r.createEventStreamIfNeeded(ctx, query)
	if err != nil {
		return nil, nil, err
	}

	targets, err := r.resolveTargets(ctx, query, impersonatedClient)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to resolve targets: %w", err)
	}

	allResponses := r.executeTargetsInParallel(ctx, query, targets, impersonatedClient, memory, eventStream, tokenCollector)
	return allResponses, eventStream, nil
}

func (r *QueryReconciler) createEventStreamIfNeeded(ctx context.Context, query arkv1alpha1.Query) (genai.EventStreamInterface, error) {
	if !genai.IsStreamingEnabled(query) {
		return nil, nil
	}

	sessionId := query.Spec.SessionId
	if sessionId == "" {
		sessionId = string(query.UID)
	}

	eventStream, err := genai.NewEventStreamForQuery(ctx, r.Client, query.Namespace, sessionId, query.Name)
	if err != nil {
		return nil, fmt.Errorf("streaming configuration error: %w", err)
	}

	if eventStream == nil {
		logf.FromContext(ctx).Info("Streaming requested but no streaming service configured",
			"query", query.Name,
			"namespace", query.Namespace)
	}

	return eventStream, nil
}

func (r *QueryReconciler) executeTargetsInParallel(ctx context.Context, query arkv1alpha1.Query, targets []arkv1alpha1.QueryTarget, impersonatedClient client.Client, memory genai.MemoryInterface, eventStream genai.EventStreamInterface, tokenCollector *genai.TokenUsageCollector) []arkv1alpha1.Response {
	resultChan := make(chan targetResult, len(targets))
	var wg sync.WaitGroup

	for _, target := range targets {
		wg.Add(1)
		go func(target arkv1alpha1.QueryTarget) {
			defer wg.Done()
			responses, err := r.executeTarget(ctx, query, target, impersonatedClient, memory, eventStream, tokenCollector)
			resultChan <- targetResult{responses, err, target}
		}(target)
	}

	wg.Wait()
	close(resultChan)

	return r.processTargetResults(resultChan)
}

func (r *QueryReconciler) processTargetResults(resultChan chan targetResult) []arkv1alpha1.Response {
	var allResponses []arkv1alpha1.Response

	for result := range resultChan {
		switch {
		case result.err != nil:
			allResponses = append(allResponses, r.createErrorResponse(result.target, result.err))
		case result.messages == nil:
			// Skip targets that were delegated to external execution engines (messages == nil)
		default:
			response := r.createSuccessResponse(result.target, result.messages)
			allResponses = append(allResponses, response)
		}
	}

	return allResponses
}

func (r *QueryReconciler) createSuccessResponse(target arkv1alpha1.QueryTarget, messages []genai.Message) arkv1alpha1.Response {
	rawJSON, err := serializeMessages(messages)
	if err != nil {
		serializationErr := fmt.Errorf("failed to serialize messages for target %v: %w", target, err)
		return r.createErrorResponse(target, serializationErr)
	}

	return arkv1alpha1.Response{
		Target:  target,
		Content: messageToText(messages[len(messages)-1]),
		Raw:     rawJSON,
		Phase:   statusDone,
	}
}

// messageToText extracts text content from a single OpenAI message format structure.
// This function assumes the message follows OpenAI's ChatCompletionMessageParamUnion format.
func messageToText(message genai.Message) string {
	switch {
	case message.OfAssistant != nil:
		return message.OfAssistant.Content.OfString.Value
	case message.OfTool != nil:
		return message.OfTool.Content.OfString.Value
	case message.OfUser != nil:
		return message.OfUser.Content.OfString.Value
	default:
		logf.Log.Error(fmt.Errorf("LLMResponseMalformed"),
			"Unable to parse message content to text",
			"messageContent", "unknown message structure",
			"message", message)
		return ""
	}
}

// serializeMessages converts OpenAI union message types to their actual content for JSON serialization
func serializeMessages(messages []genai.Message) (string, error) {
	var actualMessages []interface{}
	for _, msg := range messages {
		switch {
		case msg.OfAssistant != nil:
			actualMessages = append(actualMessages, msg.OfAssistant)
		case msg.OfUser != nil:
			actualMessages = append(actualMessages, msg.OfUser)
		case msg.OfSystem != nil:
			actualMessages = append(actualMessages, msg.OfSystem)
		case msg.OfTool != nil:
			actualMessages = append(actualMessages, msg.OfTool)
		case msg.OfFunction != nil:
			actualMessages = append(actualMessages, msg.OfFunction)
		default:
			return "", fmt.Errorf("unknown message type encountered during serialization")
		}
	}
	rawBytes, err := json.Marshal(actualMessages)
	if err != nil {
		return "", fmt.Errorf("failed to marshal messages: %w", err)
	}
	return string(rawBytes), nil
}

func (r *QueryReconciler) setConditionCompleted(query *arkv1alpha1.Query, status metav1.ConditionStatus, reason, message string) {
	meta.SetStatusCondition(&query.Status.Conditions, metav1.Condition{
		Type:               string(arkv1alpha1.QueryCompleted),
		Status:             status,
		Reason:             reason,
		Message:            message,
		LastTransitionTime: metav1.Now(),
		ObservedGeneration: query.Generation,
	})
}

func (r *QueryReconciler) updateStatus(ctx context.Context, query *arkv1alpha1.Query, status string) error {
	return r.updateStatusWithDuration(ctx, query, status, nil)
}

func (r *QueryReconciler) updateStatusWithDuration(ctx context.Context, query *arkv1alpha1.Query, status string, duration *metav1.Duration) error {
	if ctx.Err() != nil {
		return nil
	}
	query.Status.Phase = status
	switch status {
	case statusRunning:
		r.setConditionCompleted(query, metav1.ConditionFalse, "QueryRunning", "Query is running")
	case statusDone:
		r.setConditionCompleted(query, metav1.ConditionTrue, "QuerySucceeded", "Query completed successfully")
	case statusError:
		errorMsg := "Query completed with error"
		for _, response := range query.Status.Responses {
			if response.Phase == statusError && response.Content != "" {
				errorMsg = response.Content
				break
			}
		}
		r.setConditionCompleted(query, metav1.ConditionTrue, "QueryErrored", errorMsg)
	case statusCanceled:
		r.setConditionCompleted(query, metav1.ConditionTrue, "QueryCanceled", "Query canceled")
	}
	if duration != nil {
		query.Status.Duration = duration
	}
	err := r.Status().Update(ctx, query)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update query status", "status", status)
	}
	return err
}

// determineQueryStatus checks if any responses have error phase and returns appropriate query status
func (r *QueryReconciler) determineQueryStatus(responses []arkv1alpha1.Response) string {
	for _, response := range responses {
		if response.Phase == statusError {
			return statusError
		}
	}
	return statusDone
}

// createErrorResponse creates a standardized error response for a failed target
func (r *QueryReconciler) createErrorResponse(target arkv1alpha1.QueryTarget, err error) arkv1alpha1.Response {
	// Create error structure for Raw field - similar to successful message format
	errorMessage := map[string]interface{}{
		"error":   "target_execution_error",
		"message": err.Error(),
	}
	errorRaw, _ := json.Marshal([]map[string]interface{}{errorMessage})

	return arkv1alpha1.Response{
		Target:  target,
		Content: err.Error(),
		Raw:     string(errorRaw),
		Phase:   statusError,
	}
}

func (r *QueryReconciler) finalize(ctx context.Context, query *arkv1alpha1.Query) {
	log := logf.FromContext(ctx)
	log.Info("finalizing query", "name", query.Name, "namespace", query.Namespace)

	nsName := types.NamespacedName{Name: query.Name, Namespace: query.Namespace}
	if cancel, exists := r.operations.Load(nsName); exists {
		if cancelFunc, ok := cancel.(context.CancelFunc); ok {
			cancelFunc()
		}
		r.operations.Delete(nsName)
		log.Info("cancelled running operation for query", "name", query.Name, "namespace", query.Namespace)
	}
}

func (r *QueryReconciler) executeTarget(ctx context.Context, query arkv1alpha1.Query, target arkv1alpha1.QueryTarget, impersonatedClient client.Client, memory genai.MemoryInterface, eventStream genai.EventStreamInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	// Store query in context for access in deeper call stacks
	ctx = context.WithValue(ctx, genai.QueryContextKey, &query)

	// Create target-specific span for observability.
	// This span tracks execution of a single target (agent/team/model/tool) and records:
	// - Target type and name as attributes
	// - Input/output content for debugging
	// - Execution time and outcome
	ctx, span := r.Telemetry.QueryRecorder().StartTarget(ctx, target.Type, target.Name)
	defer span.End()

	// Add query and session context for streaming metadata
	queryID := string(query.UID)
	sessionID := query.Spec.SessionId
	ctx = genai.WithQueryContext(ctx, queryID, sessionID, query.Name)

	// Add execution metadata for streaming
	targetString := fmt.Sprintf("%s/%s", target.Type, target.Name)
	ctx = genai.WithExecutionMetadata(ctx, map[string]interface{}{
		"target": targetString,
	})

	var err error
	metadata := map[string]string{"targetType": target.Type, "targetName": target.Name}

	// Get input messages for processing and telemetry
	inputMessages, err := genai.GetQueryInputMessages(ctx, query, impersonatedClient)
	if err != nil {
		r.Telemetry.QueryRecorder().RecordError(span, err)
		// Add trace correlation to event metadata for observability linkage
		metadata["traceId"] = span.TraceID()
		metadata["spanId"] = span.SpanID()
		event := genai.ExecutionEvent{
			BaseEvent: genai.BaseEvent{Name: target.Name, Metadata: metadata},
			Type:      target.Type,
		}
		tokenCollector.EmitEvent(ctx, corev1.EventTypeWarning, "QueryResolveError", event)
		return nil, err
	}

	// Record input for telemetry
	userContent := genai.ExtractUserMessageContent(inputMessages)
	r.Telemetry.QueryRecorder().RecordInput(span, userContent)

	timeout := 5 * time.Minute
	if query.Spec.Timeout != nil {
		timeout = query.Spec.Timeout.Duration
	}
	execCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var responseMessages []genai.Message
	switch target.Type {
	case "agent":
		responseMessages, err = r.executeAgent(execCtx, query, inputMessages, target.Name, impersonatedClient, memory, eventStream, tokenCollector)
	case "team":
		responseMessages, err = r.executeTeam(execCtx, query, inputMessages, target.Name, impersonatedClient, memory, eventStream, tokenCollector)
	case "model":
		responseMessages, err = r.executeModel(execCtx, query, inputMessages, target.Name, impersonatedClient, memory, eventStream, tokenCollector)
	case "tool":
		responseMessages, err = r.executeTool(execCtx, query, inputMessages, target.Name, impersonatedClient, tokenCollector)
	default:
		panic(fmt.Errorf("unknown query target type:%s", target.Type))
	}

	if err != nil {
		r.Telemetry.QueryRecorder().RecordError(span, err)
		// Add trace correlation to event metadata for observability linkage
		metadata["traceId"] = span.TraceID()
		metadata["spanId"] = span.SpanID()
		event := genai.ExecutionEvent{
			BaseEvent: genai.BaseEvent{Name: target.Name, Metadata: metadata},
			Type:      target.Type,
		}
		tokenCollector.EmitEvent(ctx, corev1.EventTypeWarning, "TargetExecutionError", event)
	} else {
		// Set the final response as output at trace level
		if len(responseMessages) > 0 {
			lastMessage := responseMessages[len(responseMessages)-1]
			responseContent := messageToText(lastMessage)
			r.Telemetry.QueryRecorder().RecordOutput(span, responseContent)
		}
		r.Telemetry.QueryRecorder().RecordSuccess(span)
		// Add trace correlation to event metadata for observability linkage
		metadata["traceId"] = span.TraceID()
		metadata["spanId"] = span.SpanID()
		event := genai.ExecutionEvent{
			BaseEvent: genai.BaseEvent{Name: target.Name, Metadata: metadata},
			Type:      target.Type,
		}
		tokenCollector.EmitEvent(ctx, corev1.EventTypeNormal, "TargetExecutionComplete", event)
	}
	return responseMessages, err
}

func (r *QueryReconciler) executeAgent(ctx context.Context, query arkv1alpha1.Query, inputMessages []genai.Message, agentName string, impersonatedClient client.Client, memory genai.MemoryInterface, eventStream genai.EventStreamInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	var agentCRD arkv1alpha1.Agent
	agentKey := types.NamespacedName{Name: agentName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, agentKey, &agentCRD); err != nil {
		return nil, fmt.Errorf("unable to get %v, error:%w", agentKey, err)
	}

	// Add agent to execution metadata
	// This ensures that clients can see the specific agent being queried when streaming
	ctx = genai.WithExecutionMetadata(ctx, map[string]interface{}{
		"agent": agentName,
	})

	// Regular agent execution
	agent, err := genai.MakeAgent(ctx, impersonatedClient, &agentCRD, tokenCollector, r.Telemetry)
	if err != nil {
		return nil, fmt.Errorf("unable to make agent %v, error:%w", agentKey, err)
	}

	// Load existing messages from memory
	memoryMessages, err := r.loadInitialMessages(ctx, memory)
	if err != nil {
		return nil, fmt.Errorf("unable to load initial messages: %w", err)
	}

	// Execute agent with the last message as the current input and previous messages as context
	currentMessage, contextMessages := genai.PrepareExecutionMessages(inputMessages, memoryMessages)

	responseMessages, err := agent.Execute(ctx, currentMessage, contextMessages, memory, eventStream)
	if err != nil {
		return nil, err
	}

	// Save all new messages (input + response) to memory
	newMessages := genai.PrepareNewMessagesForMemory(inputMessages, responseMessages)
	if err := memory.AddMessages(ctx, query.Name, newMessages); err != nil {
		return nil, fmt.Errorf("failed to save new messages to memory: %w", err)
	}

	return responseMessages, nil
}

func (r *QueryReconciler) executeTeam(ctx context.Context, query arkv1alpha1.Query, inputMessages []genai.Message, teamName string, impersonatedClient client.Client, memory genai.MemoryInterface, eventStream genai.EventStreamInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	var teamCRD arkv1alpha1.Team
	teamKey := types.NamespacedName{Name: teamName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, teamKey, &teamCRD); err != nil {
		return nil, fmt.Errorf("unable to fetch team %v, error:%w", teamKey, err)
	}

	team, err := genai.MakeTeam(ctx, impersonatedClient, &teamCRD, tokenCollector, r.Telemetry)
	if err != nil {
		return nil, fmt.Errorf("unable to make team %v, error:%w", teamKey, err)
	}

	historyMessages, err := r.loadInitialMessages(ctx, memory)
	if err != nil {
		return nil, fmt.Errorf("unable to load initial messages: %w", err)
	}

	// Execute team with the last message as the current input and previous messages as context
	currentMessage, contextMessages := genai.PrepareExecutionMessages(inputMessages, historyMessages)

	responseMessages, err := team.Execute(ctx, currentMessage, contextMessages, memory, eventStream)
	if err != nil {
		return nil, err
	}

	// Save all new messages (input + response) to memory
	newMessages := genai.PrepareNewMessagesForMemory(inputMessages, responseMessages)
	if err := memory.AddMessages(ctx, query.Name, newMessages); err != nil {
		return nil, fmt.Errorf("failed to save new messages to memory: %w", err)
	}

	return responseMessages, nil
}

func (r *QueryReconciler) executeModel(ctx context.Context, query arkv1alpha1.Query, inputMessages []genai.Message, modelName string, impersonatedClient client.Client, memory genai.MemoryInterface, eventStream genai.EventStreamInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	var modelCRD arkv1alpha1.Model
	modelKey := types.NamespacedName{Name: modelName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, modelKey, &modelCRD); err != nil {
		return nil, fmt.Errorf("unable to get %v, error:%w", modelKey, err)
	}

	model, err := genai.LoadModel(ctx, impersonatedClient, &arkv1alpha1.AgentModelRef{Name: modelName, Namespace: query.Namespace}, query.Namespace, nil, r.Telemetry.ModelRecorder())
	if err != nil {
		return nil, fmt.Errorf("unable to load model %v, error:%w", modelKey, err)
	}

	historyMessages, err := r.loadInitialMessages(ctx, memory)
	if err != nil {
		return nil, fmt.Errorf("unable to load initial messages: %w", err)
	}

	// Append all input messages to conversation history
	allMessages := genai.PrepareModelMessages(inputMessages, historyMessages)

	// Create operation tracker for the model call
	modelTracker := genai.NewOperationTracker(tokenCollector, ctx, "ModelCall", modelName, map[string]string{
		"model":     modelName,
		"type":      "direct",
		"streaming": fmt.Sprintf("%t", eventStream != nil),
	})

	var responseMessages []genai.Message

	if eventStream != nil {
		// Execute with streaming
		// Token usage is tracked within executeModelWithStreaming via the modelTracker
		var err error
		responseMessages, err = r.executeModelWithStreaming(ctx, model, allMessages, eventStream, modelTracker)
		if err != nil {
			return nil, err
		}
	} else {
		completion, err := model.ChatCompletion(ctx, allMessages, nil, 1)
		if err != nil {
			modelTracker.Fail(err)
			return nil, fmt.Errorf("model chat completion failed: %w", err)
		}

		// Extract and track token usage
		tokenUsage := genai.TokenUsage{
			PromptTokens:     completion.Usage.PromptTokens,
			CompletionTokens: completion.Usage.CompletionTokens,
			TotalTokens:      completion.Usage.TotalTokens,
		}
		modelTracker.CompleteWithTokens(tokenUsage)

		if len(completion.Choices) == 0 {
			return nil, fmt.Errorf("model returned no completion choices")
		}

		choice := completion.Choices[0]
		assistantMessage := genai.NewAssistantMessage(choice.Message.Content)
		responseMessages = []genai.Message{assistantMessage}
	}

	// Save all new messages (input + response) to memory
	newMessages := genai.PrepareNewMessagesForMemory(inputMessages, responseMessages)
	if err := memory.AddMessages(ctx, query.Name, newMessages); err != nil {
		return nil, fmt.Errorf("failed to save new messages to memory: %w", err)
	}

	return responseMessages, nil
}

func (r *QueryReconciler) executeTool(ctx context.Context, crd arkv1alpha1.Query, inputMessages []genai.Message, toolName string, impersonatedClient client.Client, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) { //nolint:unparam
	// tokenCollector parameter is kept for consistency with other execute methods but not used since tools don't consume tokens
	log := logf.FromContext(ctx)

	query, err := genai.MakeQuery(&crd)
	if err != nil {
		return nil, fmt.Errorf("unable to make query from CRD, error:%w", err)
	}

	var toolCRD arkv1alpha1.Tool
	toolKey := types.NamespacedName{Name: toolName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, toolKey, &toolCRD); err != nil {
		return nil, fmt.Errorf("unable to get tool %v, error:%w", toolKey, err)
	}

	// For tools, extract the content from the last message as tool arguments
	lastMessage := inputMessages[len(inputMessages)-1]
	var resolvedInput string
	switch {
	case lastMessage.OfUser != nil:
		resolvedInput = lastMessage.OfUser.Content.OfString.Value
	case lastMessage.OfAssistant != nil:
		resolvedInput = lastMessage.OfAssistant.Content.OfString.Value
	case lastMessage.OfTool != nil:
		resolvedInput = lastMessage.OfTool.Content.OfString.Value
	default:
		return nil, fmt.Errorf("unable to extract content from input message")
	}

	// Parse tool arguments from resolved input (JSON format expected)
	var toolArgs map[string]any
	if err := json.Unmarshal([]byte(resolvedInput), &toolArgs); err != nil {
		// If not valid JSON, treat as single string argument
		toolArgs = map[string]any{"input": resolvedInput}
	}

	// Create tool call using proper openai types
	toolCall := genai.ToolCall{
		ID: "tool-call-" + toolName,
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      toolName,
			Arguments: mustMarshalJSON(toolArgs),
		},
		Type: "function",
	}

	toolRegistry := genai.NewToolRegistry(query.McpSettings, r.Telemetry.ToolRecorder())
	defer func() {
		if err := toolRegistry.Close(); err != nil {
			// Log the error but don't fail the request since tool execution already succeeded
			log.Error(err, "Failed to close MCP client connections in tool registry")
		}
		log.Info("MCP client connections closed successfully")
	}()

	toolDefinition := genai.CreateToolFromCRD(&toolCRD)
	// Pass the tool registry's MCP pool to CreateToolExecutor
	mcpPool, McpSettings := toolRegistry.GetMCPPool()
	executor, err := genai.CreateToolExecutor(ctx, impersonatedClient, &toolCRD, query.Namespace, mcpPool, McpSettings, r.Telemetry)
	if err != nil {
		return nil, fmt.Errorf("failed to create tool executor: %w", err)
	}
	toolRegistry.RegisterTool(toolDefinition, executor)

	// Execute the tool using the same ExecuteTool method agents use
	result, err := toolRegistry.ExecuteTool(ctx, toolCall, tokenCollector)
	if err != nil {
		return nil, fmt.Errorf("tool execution failed: %w", err)
	}

	// Create response message with tool result
	assistantMessage := genai.NewAssistantMessage(result.Content)
	responseMessages := []genai.Message{assistantMessage}

	return responseMessages, nil
}

func mustMarshalJSON(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func (r *QueryReconciler) loadInitialMessages(ctx context.Context, memory genai.MemoryInterface) ([]genai.Message, error) {
	messages, err := memory.GetMessages(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get messages from memory: %w", err)
	}

	return messages, nil
}

func (r *QueryReconciler) getClientForQuery(query arkv1alpha1.Query) (client.Client, error) {
	// If no service account specified, use controller's own identity.
	// This allows queries to run without impersonation when not needed,
	// and supports local development where impersonation isn't available.
	serviceAccount := query.Spec.ServiceAccount
	if serviceAccount == "" {
		return r.Client, nil
	}

	// Impersonate the specified service account.
	// Note: This requires rbac.impersonation.enabled=true in the Helm chart.
	// Future architecture will move this to per-namespace query executor pods.
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get in-cluster config: %w", err)
	}

	cfg.Impersonate = rest.ImpersonationConfig{
		UserName: fmt.Sprintf("system:serviceaccount:%s:%s", query.Namespace, serviceAccount),
	}

	impersonatedClient, err := client.New(cfg, client.Options{
		Scheme: r.Scheme,
		Mapper: r.RESTMapper(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create impersonated client for service account %s/%s: %w", query.Namespace, serviceAccount, err)
	}

	return impersonatedClient, nil
}

func (r *QueryReconciler) cleanupExistingOperation(namespacedName types.NamespacedName) {
	if existingOp, exists := r.operations.Load(namespacedName); exists {
		logf.Log.Info("Found existing operation, clearing due to cancel", "query", namespacedName.String())
		if cancel, ok := existingOp.(context.CancelFunc); ok {
			cancel()
		}
		r.operations.Delete(namespacedName)
	} else {
		logf.Log.Info("No existing operation found to cleanup", "query", namespacedName.String())
	}
}

func (r *QueryReconciler) executeModelWithStreaming(ctx context.Context, model *genai.Model, messages []genai.Message, eventStream genai.EventStreamInterface, modelTracker *genai.OperationTracker) ([]genai.Message, error) {
	// Call model with streaming enabled
	completion, err := model.ChatCompletion(ctx, messages, eventStream, 1)
	if err != nil {
		modelTracker.Fail(err)
		return nil, fmt.Errorf("model streaming completion failed: %w", err)
	}

	// Extract and track token usage
	tokenUsage := genai.TokenUsage{
		PromptTokens:     completion.Usage.PromptTokens,
		CompletionTokens: completion.Usage.CompletionTokens,
		TotalTokens:      completion.Usage.TotalTokens,
	}
	modelTracker.CompleteWithTokens(tokenUsage)

	if len(completion.Choices) == 0 {
		return nil, fmt.Errorf("model returned no completion choices")
	}

	choice := completion.Choices[0]

	// Create the assistant message with the full response (preserves tool calls if present)
	// This matches the non-streaming path but uses the full message instead of just content
	assistantMessage := genai.Message(choice.Message.ToParam())
	responseMessages := []genai.Message{assistantMessage}

	return responseMessages, nil
}

func (r *QueryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Query{}).
		Named("query").
		Complete(r)
}
