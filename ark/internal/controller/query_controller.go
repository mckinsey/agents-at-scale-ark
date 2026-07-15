/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	stderrors "errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/semaphore"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/util/retry"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"go.opentelemetry.io/otel/baggage"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/common"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	"mckinsey.com/ark/internal/resolution"
	"mckinsey.com/ark/internal/telemetry"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
	otelimpl "mckinsey.com/ark/internal/telemetry/otel"
)

// maxApprovalCascades caps the number of times the agent can be resumed after
// an approval denial. Without a cap, an LLM that ignores rejection (e.g. when
// the user prompt strongly insists on the tool) can spin a new approval task
// after every denial, never terminating.
const maxApprovalCascades = 3

const (
	targetTypeAgent = "agent"
	targetTypeTeam  = "team"
	targetTypeModel = "model"
	targetTypeTool  = "tool"

	messageCleanupGracePeriod   = 5 * time.Minute
	messageCleanupRetryInterval = 15 * time.Second

	// queryCapacityRequeueDelay is how long Reconcile waits before retrying
	// when MaxConcurrentQueries is reached. Short enough to be responsive,
	// long enough to avoid a busy-loop while in-flight queries drain.
	queryCapacityRequeueDelay = 250 * time.Millisecond
)

type QueryReconciler struct {
	client.Client
	Scheme          *runtime.Scheme
	Telemetry       *telemetryconfig.Provider
	Eventing        *eventingconfig.Provider
	CompletionsAddr string

	// MaxConcurrentQueries caps the number of Query executions running in
	// goroutines at once. When the cap is reached, Reconcile() requeues so
	// the workqueue (cheap, object keys only) holds the backlog instead of
	// the controller heap. Set to 0 to disable enforcement.
	MaxConcurrentQueries int

	// MaxConcurrentReconciles sets how many Query keys can be reconciled in
	// parallel. The controller-runtime workqueue dedupes per-key, so concurrent
	// reconciles only run for different Query objects — Reconcile() for the
	// same key is still serialized. Set to 0 to use the controller-runtime
	// default (1).
	MaxConcurrentReconciles int

	sem        *semaphore.Weighted
	operations sync.Map
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=memories,verbs=get
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=arkconfigs,verbs=get;list;watch
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

	// Garbage-collect the Query once it has been in a terminal phase for
	// longer than its TTL. TTL is measured from completion, not creation,
	// so long-running or queued queries are never reaped mid-flight.
	// TTL may be nil when using aggregated API server (non-CRD storage).
	if ttlRemaining(&obj) < 0 && isTerminalPhase(obj.Status.Phase) && obj.DeletionTimestamp.IsZero() {
		if err := r.Delete(ctx, &obj); err != nil {
			log.Error(err, "unable to delete object")
			return ctrl.Result{}, err
		}
		// Refetch so handleFinalizer below sees the DeletionTimestamp
		// and clears the finalizer in this same reconcile (#2828).
		if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
			return ctrl.Result{}, client.IgnoreNotFound(err)
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
		if err := r.finalize(ctx, obj); err != nil {
			log := logf.FromContext(ctx)
			if time.Since(obj.DeletionTimestamp.Time) > messageCleanupGracePeriod {
				log.Error(err, "giving up on broker message cleanup after grace period", "query", obj.Name)
				controllerutil.RemoveFinalizer(obj, finalizer)
				return &ctrl.Result{}, r.Update(ctx, obj)
			}
			log.Error(err, "broker message cleanup failed, will retry", "query", obj.Name)
			return &ctrl.Result{RequeueAfter: messageCleanupRetryInterval}, nil
		}
		controllerutil.RemoveFinalizer(obj, finalizer)
		return &ctrl.Result{}, r.Update(ctx, obj)
	}

	return &ctrl.Result{}, nil
}

func (r *QueryReconciler) handleQueryExecution(ctx context.Context, req ctrl.Request, obj arkv1alpha1.Query) (ctrl.Result, error) {
	if obj.Spec.Cancel && obj.Status.Phase != statusCanceled {
		r.cleanupExistingOperation(req.NamespacedName)
		if err := r.updateStatus(ctx, &obj, statusCanceled); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	switch obj.Status.Phase {
	case statusDone, statusError, statusCanceled:
		remaining := ttlRemaining(&obj)
		if remaining == 0 {
			return ctrl.Result{}, nil
		}
		if remaining < 0 {
			// RequeueAfter requires a positive time: 1ns means it will be
			// requeued for GC almost immediately
			remaining = time.Nanosecond
		}
		return ctrl.Result{RequeueAfter: remaining}, nil
	case statusInputRequired:
		// Query is awaiting approval/input, check if A2ATask has completed
		return r.handleInputRequiredPhase(ctx, &obj)
	case statusProvisioning, statusRunning:
		return r.handleRunningPhase(ctx, req, obj)
	default:
		if err := r.updateStatus(ctx, &obj, statusRunning); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}
}

// ttlRemaining returns the time left until the Query's post-completion TTL
// elapses: zero means TTL is not configured, negative means TTL has already
// elapsed, positive means time left until expiry. The anchor is the
// QueryCompleted condition's LastTransitionTime; if that condition is
// missing on a terminal-phase Query (a corrupt state our updater should
// not produce), the anchor falls back to CreationTimestamp so GC still
// fires eventually instead of stranding the object.
func ttlRemaining(obj *arkv1alpha1.Query) time.Duration {
	if obj.Spec.TTL == nil {
		return 0
	}
	anchor := obj.CreationTimestamp.Time
	if completedAt := queryCompletedAt(obj); completedAt != nil {
		anchor = *completedAt
	}
	return time.Until(anchor.Add(obj.Spec.TTL.Duration))
}

func (r *QueryReconciler) handleRunningPhase(ctx context.Context, req ctrl.Request, obj arkv1alpha1.Query) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if _, exists := r.operations.Load(req.NamespacedName); exists {
		log.Info("Exists")
		return ctrl.Result{}, nil
	}

	if r.sem != nil && !r.sem.TryAcquire(1) {
		log.V(1).Info("query execution capacity reached, requeuing", "query", req.String(), "cap", r.MaxConcurrentQueries)
		return ctrl.Result{RequeueAfter: queryCapacityRequeueDelay}, nil
	}

	// Execution deadline is governed by Spec.Timeout, applied per-A2A-call in
	// sendQueryA2A. The cancel handle is stored so Spec.Cancel can interrupt
	// the goroutine via cleanupExistingOperation.
	opCtx, cancel := context.WithCancel(ctx)
	r.operations.Store(req.NamespacedName, cancel)

	go r.executeQueryAsync(opCtx, obj, req.NamespacedName)
	return ctrl.Result{}, nil
}

func (r *QueryReconciler) handleInputRequiredPhase(ctx context.Context, obj *arkv1alpha1.Query) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Check if there's an associated A2ATask
	if obj.Status.Response == nil || obj.Status.Response.A2A == nil || obj.Status.Response.A2A.TaskID == "" {
		log.Info("Query in input-required phase but no A2ATask found, waiting")
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	}

	taskID := obj.Status.Response.A2A.TaskID
	taskName := fmt.Sprintf("a2a-task-%s", taskID)

	var a2aTask arkv1alpha1.A2ATask
	if err := r.Get(ctx, types.NamespacedName{Name: taskName, Namespace: obj.Namespace}, &a2aTask); err != nil {
		if client.IgnoreNotFound(err) != nil {
			log.Error(err, "failed to get A2ATask")
			return ctrl.Result{}, err
		}
		// Task not found yet, wait
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	}

	// Check task phase
	switch a2aTask.Status.Phase {
	case arka2a.PhaseCompleted:
		return r.handleApprovedTask(ctx, obj, taskID)
	case arka2a.PhaseFailed, arka2a.PhaseCancelled:
		return r.handleDeniedOrFailedTask(ctx, obj, &a2aTask, taskID)
	default:
		// Task still pending, keep waiting
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	}
}

// handleApprovedTask resumes query execution after an approval was granted.
func (r *QueryReconciler) handleApprovedTask(ctx context.Context, obj *arkv1alpha1.Query, taskID string) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("A2ATask completed, resuming query execution", "taskId", taskID)
	// Note: Don't clear taskID here - executor needs it to detect resumption;
	// the executor clears it after processing.

	// Approval was granted: reset the cascade counter so legitimate multi-step
	// flows aren't penalised by earlier denials in the chain.
	if err := r.resetApprovalCascadeCount(ctx, obj); err != nil {
		log.Error(err, "failed to reset approval cascade counter")
	}

	r.clearOperationCacheForResumption(ctx, obj, "task completed")

	if err := r.updateStatus(ctx, obj, statusRunning); err != nil {
		return ctrl.Result{}, err
	}
	// Immediately requeue to trigger executor resumption
	return ctrl.Result{Requeue: true}, nil
}

// handleDeniedOrFailedTask resumes the agent on a resumable denial, otherwise
// marks the query as errored.
func (r *QueryReconciler) handleDeniedOrFailedTask(ctx context.Context, obj *arkv1alpha1.Query, a2aTask *arkv1alpha1.A2ATask, taskID string) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// A denial the agent can react to (explicit reject or timeout-reject) resumes
	// execution so the agent produces a final response. Only true failures land
	// the query in error.
	if arka2a.IsResumableDenial(a2aTask) {
		return r.handleResumableDenial(ctx, obj, taskID)
	}

	log.Info("A2ATask failed or cancelled, marking query as error", "taskId", taskID, "phase", a2aTask.Status.Phase, "error", a2aTask.Status.Error)
	if a2aTask.Status.Error != "" {
		var target arkv1alpha1.QueryTarget
		if obj.Status.Response != nil {
			target = obj.Status.Response.Target
		}
		obj.Status.Response = &arkv1alpha1.Response{
			Target:  target,
			Content: a2aTask.Status.Error,
			Phase:   statusError,
		}
	}
	if err := r.updateStatus(ctx, obj, statusError); err != nil {
		return ctrl.Result{}, err
	}
	// The status update to error re-triggers reconcile, where the terminal-phase
	// case computes the TTL-based requeue for garbage collection.
	return ctrl.Result{}, nil
}

func (r *QueryReconciler) executeQueryAsync(opCtx context.Context, obj arkv1alpha1.Query, namespacedName types.NamespacedName) {
	log := logf.FromContext(opCtx)

	defer r.finishExecuteQueryAsync(opCtx, namespacedName)

	// Re-fetch query to get latest status (may have been updated with A2A taskID for resumption)
	if err := r.Get(opCtx, namespacedName, &obj); err != nil {
		log.Error(err, "failed to re-fetch query for execution")
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	// Debug: Log query status after re-fetch to verify taskID is present for resumptions
	log.Info("Query status after re-fetch in executeQueryAsync",
		"queryName", obj.Name,
		"queryPhase", obj.Status.Phase,
		"hasResponse", obj.Status.Response != nil,
		"hasA2A", obj.Status.Response != nil && obj.Status.Response.A2A != nil,
		"taskId", func() string {
			if obj.Status.Response != nil && obj.Status.Response.A2A != nil {
				return obj.Status.Response.A2A.TaskID
			}
			return "none"
		}())

	opCtx = r.initializeQueryExecutionContext(opCtx, &obj)

	sessionId := obj.Spec.SessionId
	if sessionId == "" {
		sessionId = string(obj.UID)
	}

	opCtx, dispatchSpan := r.Telemetry.Tracer().Start(
		opCtx, fmt.Sprintf("query.%s.dispatch", obj.Name),
		telemetry.WithSpanKind(telemetry.SpanKindChain),
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrQueryName, obj.Name),
			telemetry.String(telemetry.AttrQueryNamespace, obj.Namespace),
			telemetry.String(telemetry.AttrSessionID, sessionId),
		),
	)
	defer dispatchSpan.End()

	impersonatedClient, err := r.getClientForQuery(obj)
	if err != nil {
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	if err := r.handleQueryDispatch(opCtx, &obj, dispatchSpan, impersonatedClient); err != nil {
		_ = r.updateStatus(opCtx, &obj, statusError)
	}
}

func (r *QueryReconciler) finishExecuteQueryAsync(ctx context.Context, namespacedName types.NamespacedName) {
	if rec := recover(); rec != nil {
		logf.FromContext(ctx).Error(fmt.Errorf("query execution goroutine panic: %v", rec), "Query execution goroutine panicked")
	}
	r.operations.Delete(namespacedName)
	if r.sem != nil {
		r.sem.Release(1)
	}
}

func buildOperationData(target *arkv1alpha1.QueryTarget, queryInput string) map[string]string {
	operationData := make(map[string]string)
	operationData["targetType"] = target.Type

	switch target.Type {
	case targetTypeTeam:
		operationData["team"] = target.Name
	case targetTypeAgent:
		operationData["agent"] = target.Name
	case targetTypeTool:
		operationData["tool"] = target.Name
	}

	if queryInput != "" {
		const maxDisplayInputLength = 48
		displayInput := queryInput
		if len(displayInput) > maxDisplayInputLength {
			displayInput = displayInput[:maxDisplayInputLength-3] + "..."
		}
		operationData["input"] = displayInput
	}

	return operationData
}

func (r *QueryReconciler) resolveDispatchAddress(ctx context.Context, target arkv1alpha1.QueryTarget, namespace string) (string, error) {
	if target.Type != targetTypeAgent {
		return r.CompletionsAddr, nil
	}

	var agentCRD arkv1alpha1.Agent
	err := r.Get(ctx, types.NamespacedName{Name: target.Name, Namespace: namespace}, &agentCRD)
	if err != nil {
		return r.CompletionsAddr, nil
	}

	if agentCRD.Spec.ExecutionEngine == nil {
		return r.CompletionsAddr, nil
	}

	if agentCRD.Spec.ExecutionEngine.Name == arka2a.ExecutionEngineA2A {
		return r.CompletionsAddr, nil
	}

	engineName := agentCRD.Spec.ExecutionEngine.Name
	engineNamespace := agentCRD.Spec.ExecutionEngine.Namespace
	if engineNamespace == "" {
		engineNamespace = namespace
	}

	var engineCRD arkv1prealpha1.ExecutionEngine
	if err := r.Get(ctx, types.NamespacedName{Name: engineName, Namespace: engineNamespace}, &engineCRD); err != nil {
		return "", fmt.Errorf("execution engine %s not found in namespace %s: %w", engineName, engineNamespace, err)
	}

	if engineCRD.Status.LastResolvedAddress == "" {
		return "", fmt.Errorf("execution engine %s address not yet resolved", engineName)
	}

	return engineCRD.Status.LastResolvedAddress, nil
}

func (r *QueryReconciler) sendQueryA2A(ctx context.Context, address string, query arkv1alpha1.Query, target arkv1alpha1.QueryTarget) (*arkv1alpha1.Response, engineResponseMeta, error) {
	log := logf.FromContext(ctx)

	metadata := map[string]any{
		arka2a.QueryExtensionMetadataKey: map[string]string{
			"name":      query.Name,
			"namespace": query.Namespace,
		},
	}

	userText := extractUserInput(ctx, query, r.Client)
	var message protocol.Message
	// Use conversationId from spec (user-provided) or status (from previous execution/resumption)
	// This ensures we maintain the same conversation across approvals and resumptions
	conversationId := query.Spec.ConversationId
	if conversationId == "" {
		conversationId = query.Status.ConversationId
	}
	if conversationId != "" {
		message = protocol.NewMessageWithContext(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(userText),
		}, nil, &conversationId)
	} else {
		message = protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
			protocol.NewTextPart(userText),
		})
	}
	message.Metadata = metadata
	message.Extensions = []string{arka2a.QueryExtensionURI}

	timeout := 5 * time.Minute
	if query.Spec.Timeout != nil {
		timeout = query.Spec.Timeout.Duration
	}
	execCtx, cancel := context.WithTimeout(ctx, timeout)

	a2aClient, err := arka2a.CreateA2AClient(execCtx, r.Client, address, nil, query.Namespace, query.Name, nil)
	if err != nil {
		cancel()
		return nil, engineResponseMeta{}, fmt.Errorf("failed to create A2A client: %w", err)
	}
	defer cancel()

	blocking := true
	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	}

	result, err := a2aClient.SendMessage(execCtx, params)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("query execution failed: %w", err)
	}

	// Check if result is a Task (approval required)
	if task, ok := result.Result.(*protocol.Task); ok {
		// Create A2ATask CRD for tracking
		agentName := target.Name
		if err := arka2a.HandleA2ATaskResponse(ctx, r.Client, task, agentName, query.Namespace, query.Name, nil); err != nil {
			log.Error(err, "failed to create A2ATask resource")
			return nil, engineResponseMeta{}, fmt.Errorf("failed to create A2ATask: %w", err)
		}

		log.Info("A2A task created, query awaiting input", "taskId", task.ID, "state", task.Status.State)

		// Extract any text from the task status or artifacts
		responseText, _ := extractA2AResponseText(result)

		response := &arkv1alpha1.Response{
			Target:  target,
			Content: responseText,
			Raw:     "{}",
			Phase:   statusInputRequired,
			A2A: &arkv1alpha1.A2AMetadata{
				ContextID: task.ContextID,
				TaskID:    task.ID,
			},
		}

		return response, engineResponseMeta{A2AContextID: task.ContextID, A2ATaskID: task.ID}, nil
	}

	// Normal message response path
	responseText, err := extractA2AResponseText(result)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to extract response: %w", err)
	}

	engineMeta := extractEngineResponseMeta(result)

	log.V(1).Info("query A2A call completed", "query", query.Name, "target", target.Name, "address", address)

	rawJSON := engineMeta.MessagesRaw
	if rawJSON == "" {
		rawJSON = buildFallbackRaw(responseText)
	}

	response := &arkv1alpha1.Response{
		Target:  target,
		Content: responseText,
		Raw:     rawJSON,
		Phase:   statusDone,
	}

	if engineMeta.A2AContextID != "" || engineMeta.A2ATaskID != "" {
		response.A2A = &arkv1alpha1.A2AMetadata{
			ContextID: engineMeta.A2AContextID,
			TaskID:    engineMeta.A2ATaskID,
		}
	}

	return response, engineMeta, nil
}

func extractUserInput(ctx context.Context, query arkv1alpha1.Query, k8sClient client.Client) string {
	text, err := resolution.ResolveQueryInputText(ctx, query, k8sClient)
	if err != nil {
		return ""
	}
	return text
}

func buildFallbackRaw(responseText string) string {
	msg := []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}{{Role: "assistant", Content: responseText}}
	rawBytes, err := json.Marshal(msg)
	if err != nil {
		return "[]"
	}
	return string(rawBytes)
}

func extractA2AResponseText(result *protocol.MessageResult) (string, error) {
	if result == nil {
		return "", fmt.Errorf("nil result from query engine")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		return arka2a.ExtractTextFromParts(r.Parts), nil
	case *protocol.Task:
		if r.Status.Message != nil {
			return arka2a.ExtractTextFromParts(r.Status.Message.Parts), nil
		}
		for _, artifact := range r.Artifacts {
			text := arka2a.ExtractTextFromParts(artifact.Parts)
			if text != "" {
				return text, nil
			}
		}
		return "", nil
	default:
		return "", fmt.Errorf("unexpected A2A result type: %T", result.Result)
	}
}

type engineResponseMeta struct {
	TokenUsage     *arkv1alpha1.TokenUsage
	ConversationId string
	MessagesRaw    string
	A2AContextID   string
	A2ATaskID      string
}

func extractEngineResponseMeta(result *protocol.MessageResult) engineResponseMeta {
	var responseMeta engineResponseMeta
	if result == nil {
		return responseMeta
	}

	msg, ok := result.Result.(*protocol.Message)
	if !ok {
		return responseMeta
	}

	if msg.ContextID != nil && *msg.ContextID != "" {
		responseMeta.A2AContextID = *msg.ContextID
	}
	if msg.TaskID != nil && *msg.TaskID != "" {
		responseMeta.A2ATaskID = *msg.TaskID
	}

	if msg.Metadata == nil {
		return responseMeta
	}

	arkData, ok := msg.Metadata[arka2a.QueryExtensionMetadataKey]
	if !ok {
		return responseMeta
	}

	arkMap, ok := arkData.(map[string]any)
	if !ok {
		return responseMeta
	}

	if convId, ok := arkMap["conversationId"].(string); ok {
		responseMeta.ConversationId = convId
	}

	if messagesRaw, ok := arkMap["messages"]; ok {
		if rawBytes, err := json.Marshal(messagesRaw); err == nil {
			responseMeta.MessagesRaw = string(rawBytes)
		}
	}

	extractA2AMeta(arkMap, &responseMeta)
	extractTokenUsage(arkMap, &responseMeta)

	return responseMeta
}

func extractA2AMeta(arkMap map[string]any, responseMeta *engineResponseMeta) {
	a2aData, ok := arkMap["a2a"].(map[string]any)
	if !ok {
		return
	}
	if contextID, ok := a2aData["contextId"].(string); ok {
		responseMeta.A2AContextID = contextID
	}
	if taskID, ok := a2aData["taskId"].(string); ok {
		responseMeta.A2ATaskID = taskID
	}
}

func extractTokenUsage(arkMap map[string]any, responseMeta *engineResponseMeta) {
	tokenData, ok := arkMap["tokenUsage"].(map[string]any)
	if !ok {
		return
	}
	usage := &arkv1alpha1.TokenUsage{}
	if v, ok := tokenData["prompt_tokens"].(float64); ok {
		usage.PromptTokens = int64(v)
	}
	if v, ok := tokenData["completion_tokens"].(float64); ok {
		usage.CompletionTokens = int64(v)
	}
	if v, ok := tokenData["total_tokens"].(float64); ok {
		usage.TotalTokens = int64(v)
	}
	if v, ok := tokenData["cached_tokens"].(float64); ok {
		usage.CachedTokens = int64(v)
	}
	if usage.TotalTokens > 0 {
		responseMeta.TokenUsage = usage
	}
}

func (r *QueryReconciler) resolveTarget(ctx context.Context, query arkv1alpha1.Query, impersonatedClient client.Client) (*arkv1alpha1.QueryTarget, error) {
	if query.Spec.Target != nil {
		return query.Spec.Target, nil
	}

	if query.Spec.Selector != nil {
		target, err := r.resolveSelector(ctx, query.Spec.Selector, query.Namespace, impersonatedClient)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve selector: %w", err)
		}
		return target, nil
	}

	return nil, fmt.Errorf("no target or selector specified")
}

func (r *QueryReconciler) resolveSelector(ctx context.Context, selector *metav1.LabelSelector, namespace string, impersonatedClient client.Client) (*arkv1alpha1.QueryTarget, error) {
	labelSelector, err := metav1.LabelSelectorAsSelector(selector)
	if err != nil {
		return nil, fmt.Errorf("invalid label selector: %w", err)
	}

	var agentList arkv1alpha1.AgentList
	if err := impersonatedClient.List(ctx, &agentList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list agents: %w", err)
	}

	if len(agentList.Items) > 0 {
		return &arkv1alpha1.QueryTarget{
			Type: targetTypeAgent,
			Name: agentList.Items[0].Name,
		}, nil
	}

	var teamList arkv1alpha1.TeamList
	if err := impersonatedClient.List(ctx, &teamList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list teams: %w", err)
	}

	if len(teamList.Items) > 0 {
		return &arkv1alpha1.QueryTarget{
			Type: targetTypeTeam,
			Name: teamList.Items[0].Name,
		}, nil
	}

	var modelList arkv1alpha1.ModelList
	if err := impersonatedClient.List(ctx, &modelList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list models: %w", err)
	}

	if len(modelList.Items) > 0 {
		return &arkv1alpha1.QueryTarget{
			Type: targetTypeModel,
			Name: modelList.Items[0].Name,
		}, nil
	}

	var toolList arkv1alpha1.ToolList
	if err := impersonatedClient.List(ctx, &toolList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list tools: %w", err)
	}

	if len(toolList.Items) > 0 {
		return &arkv1alpha1.QueryTarget{
			Type: targetTypeTool,
			Name: toolList.Items[0].Name,
		}, nil
	}

	return nil, fmt.Errorf("no matching resources found for selector")
}

func isTerminalPhase(phase string) bool {
	switch phase {
	case statusDone, statusError, statusCanceled:
		return true
	}
	return false
}

// queryCompletedAt returns the timestamp when the Query reached a terminal
// phase, or nil if it has not. The QueryCompleted condition flips to
// Status=True only on terminal phases (Done/Error/Canceled), and
// setConditionCompleted writes LastTransitionTime explicitly each time, so
// the field is a reliable post-terminal anchor for TTL retention.
func queryCompletedAt(obj *arkv1alpha1.Query) *time.Time {
	cond := meta.FindStatusCondition(obj.Status.Conditions, string(arkv1alpha1.QueryCompleted))
	if cond == nil || cond.Status != metav1.ConditionTrue {
		return nil
	}
	t := cond.LastTransitionTime.Time
	return &t
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

func (r *QueryReconciler) setConditionForPhase(query *arkv1alpha1.Query, status string) {
	switch status {
	case statusRunning:
		r.setConditionCompleted(query, metav1.ConditionFalse, "QueryRunning", "Query is running")
	case statusDone:
		r.setConditionCompleted(query, metav1.ConditionTrue, "QuerySucceeded", "Query completed successfully")
	case statusError:
		errorMsg := "Query completed with error"
		if query.Status.Response != nil && query.Status.Response.Phase == statusError && query.Status.Response.Content != "" {
			errorMsg = query.Status.Response.Content
		}
		r.setConditionCompleted(query, metav1.ConditionTrue, "QueryErrored", errorMsg)
	case statusCanceled:
		r.setConditionCompleted(query, metav1.ConditionTrue, "QueryCanceled", "Query canceled")
	}
}

type savedQueryStatus struct {
	response       *arkv1alpha1.Response
	tokenUsage     arkv1alpha1.TokenUsage
	conversationId string
}

func (s *savedQueryStatus) restoreOnto(query *arkv1alpha1.Query) {
	if s.response != nil {
		query.Status.Response = s.response
	}
	query.Status.TokenUsage = s.tokenUsage
	if s.conversationId != "" {
		query.Status.ConversationId = s.conversationId
	}
}

func (r *QueryReconciler) updateStatusWithDuration(ctx context.Context, query *arkv1alpha1.Query, status string, duration *metav1.Duration) error {
	if ctx.Err() != nil {
		return nil
	}
	saved := savedQueryStatus{
		response:       query.Status.Response,
		tokenUsage:     query.Status.TokenUsage,
		conversationId: query.Status.ConversationId,
	}
	// Do NOT clear A2A taskID when transitioning from input-required to running.
	// The executor needs the taskID to detect this is a resumption after approval
	// and clears it after processing (handler.go).

	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		if ctx.Err() != nil {
			return nil
		}
		if err := r.Get(ctx, types.NamespacedName{Name: query.Name, Namespace: query.Namespace}, query); err != nil {
			if errors.IsNotFound(err) {
				return nil
			}
			return err
		}
		query.Status.Phase = status
		saved.restoreOnto(query)
		r.setConditionForPhase(query, status)
		if duration != nil {
			query.Status.Duration = duration
		}
		err := r.Status().Update(ctx, query)
		if err != nil {
			if errors.IsNotFound(err) {
				return nil
			}
			if !errors.IsConflict(err) {
				logf.FromContext(ctx).Error(err, "failed to update query status", "status", status)
			}
		}
		return err
	})
}

func createErrorResponse(target arkv1alpha1.QueryTarget, err error) *arkv1alpha1.Response {
	errorMessage := map[string]interface{}{
		"error":   "target_execution_error",
		"message": err.Error(),
	}
	errorRaw, _ := json.Marshal([]map[string]interface{}{errorMessage})

	return &arkv1alpha1.Response{
		Target:  target,
		Content: err.Error(),
		Raw:     string(errorRaw),
		Phase:   statusError,
	}
}

func (r *QueryReconciler) determineQueryStatus(response *arkv1alpha1.Response) string {
	if response != nil {
		if response.Phase == statusError {
			return statusError
		}
		if response.Phase == statusInputRequired {
			return statusInputRequired
		}
	}
	return statusDone
}

func (r *QueryReconciler) finalize(ctx context.Context, query *arkv1alpha1.Query) error {
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

	return r.deleteBrokerMessages(ctx, query)
}

func (r *QueryReconciler) deleteBrokerMessages(ctx context.Context, query *arkv1alpha1.Query) error {
	log := logf.FromContext(ctx)

	var memoryName, memoryNamespace string
	if query.Spec.Memory != nil {
		memoryName = query.Spec.Memory.Name
		memoryNamespace = query.Spec.Memory.Namespace
		if memoryNamespace == "" {
			memoryNamespace = query.Namespace
		}
	} else {
		memoryName = "default" //nolint:goconst
		memoryNamespace = query.Namespace
	}

	var memory arkv1alpha1.Memory
	if err := r.Get(ctx, client.ObjectKey{Name: memoryName, Namespace: memoryNamespace}, &memory); err != nil {
		if client.IgnoreNotFound(err) == nil {
			log.Info("memory not found, skipping broker message cleanup", "memory", memoryName, "query", query.Name)
			return nil
		}
		return fmt.Errorf("failed to get memory %s/%s: %w", memoryNamespace, memoryName, err)
	}

	var baseURL string
	if memory.Status.LastResolvedAddress != nil && *memory.Status.LastResolvedAddress != "" {
		baseURL = strings.TrimSuffix(*memory.Status.LastResolvedAddress, "/")
	} else {
		resolver := common.NewValueSourceResolver(r.Client)
		resolved, err := resolver.ResolveValueSource(ctx, memory.Spec.Address, memoryNamespace)
		if err != nil {
			return fmt.Errorf("failed to resolve memory address: %w", err)
		}
		baseURL = strings.TrimSuffix(resolved, "/")
	}

	requestURL := fmt.Sprintf("%s"+common.QueryMessagesEndpointFmt, baseURL, url.PathEscape(query.Name))
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, requestURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create delete request: %w", err)
	}
	req.Header.Set("User-Agent", "ark-controller/1.0")

	httpClient := common.NewHTTPClientWithLogging()
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed {
		log.Info("broker does not support delete query messages, skipping", "query", query.Name, "status", resp.StatusCode)
		return nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("broker at %s returned HTTP %d deleting messages for query %s", baseURL, resp.StatusCode, query.Name)
	}

	log.Info("deleted broker messages for query", "query", query.Name)
	return nil
}

func (r *QueryReconciler) getClientForQuery(query arkv1alpha1.Query) (client.Client, error) {
	serviceAccount := query.Spec.ServiceAccount
	if serviceAccount == "" {
		return r.Client, nil
	}

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

// handleResumableDenial runs the resumption path for a denial the agent can
// react to (explicit reject or timeout-reject). It enforces the cascade cap to
// stop an LLM that keeps retrying a denied tool from spinning forever.
func (r *QueryReconciler) handleResumableDenial(ctx context.Context, obj *arkv1alpha1.Query, taskID string) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	count := readApprovalCascadeCount(obj)
	if count >= maxApprovalCascades {
		log.Info("approval cascade cap reached, ending query", "taskId", taskID, "count", count, "cap", maxApprovalCascades)
		target := arkv1alpha1.QueryTarget{}
		if obj.Status.Response != nil {
			target = obj.Status.Response.Target
		}
		obj.Status.Response = &arkv1alpha1.Response{
			Target:  target,
			Content: fmt.Sprintf("Approval cascade limit reached (%d). The agent kept retrying a denied tool; aborting.", maxApprovalCascades),
			Phase:   statusError,
		}
		if err := r.updateStatus(ctx, obj, statusError); err != nil {
			return ctrl.Result{}, err
		}
		// The status update to error re-triggers reconcile, where the
		// terminal-phase case computes the TTL-based requeue for GC.
		return ctrl.Result{}, nil
	}

	log.Info("A2ATask denied (resumable), resuming query execution for graceful handling", "taskId", taskID, "cascadeCount", count)
	if err := r.incrementApprovalCascadeCount(ctx, obj, count); err != nil {
		log.Error(err, "failed to increment approval cascade counter")
		return ctrl.Result{}, err
	}

	r.clearOperationCacheForResumption(ctx, obj, "approval denial")
	if err := r.updateStatus(ctx, obj, statusRunning); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{Requeue: true}, nil
}

// readApprovalCascadeCount returns the number of times the agent has been
// resumed after an approval denial on this query. Unparseable annotations
// are treated as zero so the cap re-engages from scratch.
func readApprovalCascadeCount(query *arkv1alpha1.Query) int {
	if query.Annotations == nil {
		return 0
	}
	value, ok := query.Annotations[annotations.ApprovalCascadeCount]
	if !ok {
		return 0
	}
	count, err := strconv.Atoi(value)
	if err != nil || count < 0 {
		return 0
	}
	return count
}

// incrementApprovalCascadeCount persists count+1 to the query annotations.
// Uses retry-on-conflict so concurrent reconciles don't drop the increment.
func (r *QueryReconciler) incrementApprovalCascadeCount(ctx context.Context, query *arkv1alpha1.Query, current int) error {
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		latest := &arkv1alpha1.Query{}
		if err := r.Get(ctx, types.NamespacedName{Name: query.Name, Namespace: query.Namespace}, latest); err != nil {
			if errors.IsNotFound(err) {
				return nil
			}
			return err
		}
		if latest.Annotations == nil {
			latest.Annotations = map[string]string{}
		}
		latest.Annotations[annotations.ApprovalCascadeCount] = strconv.Itoa(current + 1)
		if err := r.Update(ctx, latest); err != nil {
			if errors.IsNotFound(err) {
				return nil
			}
			return err
		}
		query.Annotations = latest.Annotations
		query.ResourceVersion = latest.ResourceVersion
		return nil
	})
}

// resetApprovalCascadeCount removes the cascade annotation after a successful
// approval so the cap doesn't penalise later legitimate denials.
func (r *QueryReconciler) resetApprovalCascadeCount(ctx context.Context, query *arkv1alpha1.Query) error {
	if query.Annotations == nil {
		return nil
	}
	if _, present := query.Annotations[annotations.ApprovalCascadeCount]; !present {
		return nil
	}
	return retry.RetryOnConflict(retry.DefaultRetry, func() error {
		return r.removeApprovalCascadeAnnotation(ctx, query)
	})
}

// removeApprovalCascadeAnnotation deletes the cascade annotation from the latest
// version of the query. A deleted query is treated as success (nothing to reset).
func (r *QueryReconciler) removeApprovalCascadeAnnotation(ctx context.Context, query *arkv1alpha1.Query) error {
	latest := &arkv1alpha1.Query{}
	if err := r.Get(ctx, types.NamespacedName{Name: query.Name, Namespace: query.Namespace}, latest); err != nil {
		return client.IgnoreNotFound(err)
	}
	if latest.Annotations == nil {
		return nil
	}
	if _, present := latest.Annotations[annotations.ApprovalCascadeCount]; !present {
		return nil
	}
	delete(latest.Annotations, annotations.ApprovalCascadeCount)
	if err := r.Update(ctx, latest); err != nil {
		return client.IgnoreNotFound(err)
	}
	query.Annotations = latest.Annotations
	query.ResourceVersion = latest.ResourceVersion
	return nil
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

func (r *QueryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	r.initSemaphore()
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Query{}).
		Watches(
			&arkv1alpha1.A2ATask{},
			handler.EnqueueRequestsFromMapFunc(r.findQueriesForA2ATask),
		).
		Named("query").
		WithOptions(r.buildControllerOptions()).
		Complete(r)
}

// findQueriesForA2ATask maps an A2ATask to its associated Query for reconciliation
func (r *QueryReconciler) findQueriesForA2ATask(ctx context.Context, obj client.Object) []ctrl.Request {
	task := obj.(*arkv1alpha1.A2ATask)

	if task.Spec.QueryRef.Name == "" {
		return nil
	}

	return []ctrl.Request{
		{
			NamespacedName: types.NamespacedName{
				Name:      task.Spec.QueryRef.Name,
				Namespace: task.Spec.QueryRef.Namespace,
			},
		},
	}
}

// clearOperationCacheForResumption clears the operation cache to allow new execution goroutine for resumption
func (r *QueryReconciler) clearOperationCacheForResumption(ctx context.Context, obj *arkv1alpha1.Query, reason string) {
	log := logf.FromContext(ctx)
	nsName := types.NamespacedName{Name: obj.Name, Namespace: obj.Namespace}
	if cancel, ok := r.operations.LoadAndDelete(nsName); ok {
		if cancelFunc, ok := cancel.(context.CancelFunc); ok {
			cancelFunc()
		}
		log.Info("Cleared cached operation for resumption", "query", obj.Name, "reason", reason)
	}
}

// initializeQueryExecutionContext sets up the execution context with tracing and baggage
func (r *QueryReconciler) initializeQueryExecutionContext(ctx context.Context, obj *arkv1alpha1.Query) context.Context {
	ctx = r.Eventing.QueryRecorder().InitializeQueryContext(ctx, obj)
	ctx = r.Eventing.QueryRecorder().StartTokenCollection(ctx)
	ctx = r.Eventing.QueryRecorder().Start(ctx, "QueryExecution", fmt.Sprintf("Executing query %s", obj.Name), nil)
	ctx = otelimpl.SetQueryInContext(ctx, obj)

	sessionId := obj.Spec.SessionId
	if sessionId == "" {
		sessionId = string(obj.UID)
	}

	if member, err := baggage.NewMember("ark.session.id", sessionId); err == nil {
		if bag, err := baggage.New(member); err == nil {
			ctx = baggage.ContextWithBaggage(ctx, bag)
		}
	}

	return ctx
}

// handleQueryDispatch resolves target and address, sends the query, and processes the response
func (r *QueryReconciler) handleQueryDispatch(
	opCtx context.Context,
	obj *arkv1alpha1.Query,
	dispatchSpan telemetry.Span,
	impersonatedClient client.Client,
) error {
	log := logf.FromContext(opCtx)
	startTime := time.Now()

	target, err := r.resolveTarget(opCtx, *obj, impersonatedClient)
	if err != nil {
		dispatchSpan.RecordError(err)
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Failed to resolve target: %v", err), err, nil)
		return err
	}
	dispatchSpan.SetAttributes(
		telemetry.String(telemetry.AttrTargetType, target.Type),
		telemetry.String(telemetry.AttrTargetName, target.Name),
	)

	address, err := r.resolveDispatchAddress(opCtx, *target, obj.Namespace)
	if err != nil {
		dispatchSpan.RecordError(err)
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Failed to resolve dispatch address: %v", err), err, nil)
		return err
	}
	dispatchSpan.SetAttributes(telemetry.String("dispatch.address", address))

	response, engineMeta, err := r.sendQueryA2A(opCtx, address, *obj, *target)
	if err != nil {
		if stderrors.Is(err, context.Canceled) {
			dispatchSpan.SetStatus(telemetry.StatusOk, "canceled")
			r.Eventing.QueryRecorder().Cancel(opCtx, "QueryExecution", "Query execution canceled", nil)
			return err
		}
		dispatchSpan.RecordError(err)
		dispatchSpan.SetStatus(telemetry.StatusError, err.Error())
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Query execution failed: %v", err), err, nil)
		obj.Status.Response = createErrorResponse(*target, err)
		return err
	}
	dispatchSpan.SetStatus(telemetry.StatusOk, "success")

	obj.Status.Response = response

	if engineMeta.TokenUsage != nil {
		obj.Status.TokenUsage = *engineMeta.TokenUsage
	}
	if engineMeta.ConversationId != "" {
		obj.Status.ConversationId = engineMeta.ConversationId
	} else if engineMeta.A2AContextID != "" {
		obj.Status.ConversationId = engineMeta.A2AContextID
	}

	queryStatus := r.determineQueryStatus(response)
	duration := &metav1.Duration{Duration: time.Since(startTime)}

	log.Info("query execution completed", "query", obj.Name, "status", queryStatus, "duration", duration.Duration)

	queryInput := extractUserInput(opCtx, *obj, r.Client)
	operationData := buildOperationData(target, queryInput)
	r.Eventing.QueryRecorder().Complete(opCtx, "QueryExecution", "Query execution completed", operationData)

	// Update status with duration
	_ = r.updateStatusWithDuration(opCtx, obj, queryStatus, duration)

	return nil
}

func (r *QueryReconciler) initSemaphore() {
	if r.MaxConcurrentQueries > 0 {
		r.sem = semaphore.NewWeighted(int64(r.MaxConcurrentQueries))
	}
}

func (r *QueryReconciler) buildControllerOptions() controller.Options {
	opts := controller.Options{}
	if r.MaxConcurrentReconciles > 0 {
		opts.MaxConcurrentReconciles = r.MaxConcurrentReconciles
	}
	return opts
}
