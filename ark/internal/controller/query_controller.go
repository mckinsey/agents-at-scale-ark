/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/util/retry"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"go.opentelemetry.io/otel/baggage"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	"mckinsey.com/ark/internal/resolution"
	"mckinsey.com/ark/internal/telemetry"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
	otelimpl "mckinsey.com/ark/internal/telemetry/otel"
)

const (
	targetTypeAgent = "agent"
	targetTypeTeam  = "team"
	targetTypeModel = "model"
	targetTypeTool  = "tool"
)

type QueryReconciler struct {
	client.Client
	Scheme          *runtime.Scheme
	Telemetry       *telemetryconfig.Provider
	Eventing        *eventingconfig.Provider
	CompletionsAddr string
	operations      sync.Map
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list
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

	// Check TTL expiry if TTL is set.
	// TTL may be nil when using aggregated API server (non-CRD storage)
	// because the field is omitempty and may not be initialized.
	if obj.Spec.TTL != nil {
		expiry := obj.CreationTimestamp.Add(obj.Spec.TTL.Duration)
		if time.Now().After(expiry) {
			if err := r.Delete(ctx, &obj); err != nil {
				log.Error(err, "unable to delete object")
				return ctrl.Result{}, err
			}
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
	// Calculate expiry time for requeue. Use 1 hour default if TTL is not set.
	// TTL may be nil when using aggregated API server (non-CRD storage).
	ttl := time.Hour
	if obj.Spec.TTL != nil {
		ttl = obj.Spec.TTL.Duration
	}
	expiry := obj.CreationTimestamp.Add(ttl)

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
	case "approval-required":
		return r.handleApprovalRequiredPhase(ctx, req, obj, expiry)
	case statusProvisioning, statusRunning:
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

func (r *QueryReconciler) handleApprovalRequiredPhase(ctx context.Context, req ctrl.Request, obj arkv1alpha1.Query, expiry time.Time) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if obj.Status.ApprovalRef == nil {
		log.Error(nil, "Query in approval-required phase but no ApprovalRef", "query", obj.Name)
		if err := r.updateStatus(ctx, &obj, statusError); err != nil {
			return ctrl.Result{RequeueAfter: time.Until(expiry)}, err
		}
		return ctrl.Result{}, nil
	}

	tarNamespace := obj.Status.ApprovalRef.Namespace
	if tarNamespace == "" {
		tarNamespace = obj.Namespace
	}

	var tar arkv1alpha1.ToolApprovalRequest
	if err := r.Get(ctx, types.NamespacedName{Name: obj.Status.ApprovalRef.Name, Namespace: tarNamespace}, &tar); err != nil {
		if errors.IsNotFound(err) {
			log.Error(err, "ToolApprovalRequest not found", "tar", obj.Status.ApprovalRef.Name)
			if err := r.updateStatus(ctx, &obj, statusError); err != nil {
				return ctrl.Result{RequeueAfter: time.Until(expiry)}, err
			}
			return ctrl.Result{}, nil
		}
		return ctrl.Result{RequeueAfter: time.Until(expiry)}, err
	}

	switch tar.Status.Phase {
	case "approved":
		log.Info("ToolApprovalRequest approved, resuming execution", "query", obj.Name, "tar", tar.Name)
		if err := r.updateStatus(ctx, &obj, statusRunning); err != nil {
			return ctrl.Result{RequeueAfter: time.Until(expiry)}, err
		}
		return ctrl.Result{}, nil
	case "rejected":
		log.Info("ToolApprovalRequest rejected", "query", obj.Name, "tar", tar.Name)
		obj.Status.Response = &arkv1alpha1.Response{
			Content: "Tool execution was rejected by approver",
			Phase:   statusError,
		}
		if err := r.updateStatus(ctx, &obj, statusError); err != nil {
			return ctrl.Result{RequeueAfter: time.Until(expiry)}, err
		}
		return ctrl.Result{}, nil
	default:
		log.V(1).Info("ToolApprovalRequest still pending", "query", obj.Name, "tar", tar.Name, "phase", tar.Status.Phase)
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
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

	if obj.Status.ApprovalRef != nil {
		go r.resumeFromApprovalAsync(opCtx, obj, req.NamespacedName)
	} else {
		go r.executeQueryAsync(opCtx, obj, req.NamespacedName)
	}
	return ctrl.Result{}, nil
}

func (r *QueryReconciler) executeQueryAsync(opCtx context.Context, obj arkv1alpha1.Query, namespacedName types.NamespacedName) {
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

	opCtx = r.Eventing.QueryRecorder().InitializeQueryContext(opCtx, &obj)
	opCtx = r.Eventing.QueryRecorder().StartTokenCollection(opCtx)
	opCtx = r.Eventing.QueryRecorder().Start(opCtx, "QueryExecution", fmt.Sprintf("Executing query %s", obj.Name), nil)

	opCtx = otelimpl.SetQueryInContext(opCtx, &obj)
	sessionId := obj.Spec.SessionId
	if sessionId == "" {
		sessionId = string(obj.UID)
	}
	if member, err := baggage.NewMember("ark.session.id", sessionId); err == nil {
		if bag, err := baggage.New(member); err == nil {
			opCtx = baggage.ContextWithBaggage(opCtx, bag)
		}
	}

	queryInput := extractUserInput(opCtx, obj, r.Client)

	opCtx, dispatchSpan := r.Telemetry.Tracer().Start(opCtx, fmt.Sprintf("query.%s.dispatch", obj.Name),
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

	target, err := r.resolveTarget(opCtx, obj, impersonatedClient)
	if err != nil {
		dispatchSpan.RecordError(err)
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Failed to resolve target: %v", err), err, nil)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}
	dispatchSpan.SetAttributes(
		telemetry.String(telemetry.AttrTargetType, target.Type),
		telemetry.String(telemetry.AttrTargetName, target.Name),
	)

	address, err := r.resolveDispatchAddress(opCtx, *target, obj.Namespace)
	if err != nil {
		dispatchSpan.RecordError(err)
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Failed to resolve dispatch address: %v", err), err, nil)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}
	dispatchSpan.SetAttributes(telemetry.String("dispatch.address", address))

	response, engineMeta, err := r.sendQueryA2A(opCtx, address, obj, *target)
	if err != nil {
		dispatchSpan.RecordError(err)
		dispatchSpan.SetStatus(telemetry.StatusError, err.Error())
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Query execution failed: %v", err), err, nil)
		obj.Status.Response = createErrorResponse(*target, err)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	if engineMeta.ApprovalRef != nil {
		dispatchSpan.SetStatus(telemetry.StatusOk, "approval-required")
		obj.Status.Response = response
		obj.Status.ApprovalRef = &arkv1alpha1.ToolApprovalRef{
			Name:      engineMeta.ApprovalRef.Name,
			Namespace: engineMeta.ApprovalRef.Namespace,
		}
		if err := r.updateStatus(opCtx, &obj, "approval-required"); err != nil {
			log.Error(err, "Failed to update query status to approval-required", "query", obj.Name)
		}
		log.Info("Query requires tool approval", "query", obj.Name, "tar", engineMeta.ApprovalRef.Name)
		return
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
	_ = r.updateStatusWithDuration(opCtx, &obj, queryStatus, duration)

	log.Info("query execution completed", "query", obj.Name, "status", queryStatus, "duration", duration.Duration)

	operationData := buildOperationData(target, queryInput)
	r.Eventing.QueryRecorder().Complete(opCtx, "QueryExecution", "Query execution completed", operationData)
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

func (r *QueryReconciler) resumeFromApprovalAsync(opCtx context.Context, obj arkv1alpha1.Query, namespacedName types.NamespacedName) {
	log := logf.FromContext(opCtx)
	startTime := time.Now()

	defer func() {
		if rec := recover(); rec != nil {
			log.Error(fmt.Errorf("approval resumption goroutine panic: %v", rec), "Approval resumption goroutine panicked")
		}
		r.operations.Delete(namespacedName)
	}()

	approvalRef := obj.Status.ApprovalRef
	if approvalRef == nil {
		log.Error(fmt.Errorf("no approval ref"), "Missing approval reference for resumption")
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	tarNamespace := approvalRef.Namespace
	if tarNamespace == "" {
		tarNamespace = obj.Namespace
	}

	var tar arkv1alpha1.ToolApprovalRequest
	if err := r.Get(opCtx, types.NamespacedName{Name: approvalRef.Name, Namespace: tarNamespace}, &tar); err != nil {
		log.Error(err, "Failed to get ToolApprovalRequest for resumption")
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	if tar.Status.Phase != "approved" {
		log.Error(fmt.Errorf("TAR not approved"), "Cannot resume: ToolApprovalRequest not in approved phase", "phase", tar.Status.Phase)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	response, err := r.sendResumptionA2A(opCtx, &obj, &tar)
	if err != nil {
		log.Error(err, "Failed to resume from approval")
		r.Eventing.QueryRecorder().Fail(opCtx, "ApprovalResumption", fmt.Sprintf("Resumption failed: %v", err), err, nil)
		obj.Status.Response = createErrorResponse(*obj.Spec.Target, err)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	obj.Status.Response = response
	obj.Status.ApprovalRef = nil

	queryStatus := r.determineQueryStatus(response)
	duration := &metav1.Duration{Duration: time.Since(startTime)}
	_ = r.updateStatusWithDuration(opCtx, &obj, queryStatus, duration)

	log.Info("Approval resumption completed", "query", obj.Name, "status", queryStatus)
	r.Eventing.QueryRecorder().Complete(opCtx, "ApprovalResumption", "Resumption completed after approval", nil)
}

func (r *QueryReconciler) sendResumptionA2A(ctx context.Context, query *arkv1alpha1.Query, tar *arkv1alpha1.ToolApprovalRequest) (*arkv1alpha1.Response, error) {
	metadata := map[string]any{
		arka2a.QueryExtensionMetadataKey: map[string]string{
			"name":      query.Name,
			"namespace": query.Namespace,
		},
		"ark.resumption": map[string]string{
			"toolApprovalRequest": tar.Name,
			"namespace":           tar.Namespace,
		},
	}

	message := protocol.NewMessage(
		protocol.MessageRoleUser,
		[]protocol.Part{protocol.NewTextPart("resume from approval")},
	)
	message.Metadata = metadata

	a2aClient, err := arka2a.CreateA2AClient(ctx, r.Client, r.CompletionsAddr, nil, query.Namespace, query.Name, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create A2A client: %w", err)
	}

	blocking := true
	params := protocol.SendMessageParams{
		RPCID:   protocol.GenerateRPCID(),
		Message: message,
		Configuration: &protocol.SendMessageConfiguration{
			Blocking: &blocking,
		},
	}

	result, err := a2aClient.SendMessage(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("failed to send resumption message: %w", err)
	}

	responseText, err := extractA2AResponseText(result)
	if err != nil {
		return nil, fmt.Errorf("resumption failed: %w", err)
	}

	return &arkv1alpha1.Response{
		Target:  *query.Spec.Target,
		Content: responseText,
		Phase:   "done",
	}, nil
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
	if query.Spec.ConversationId != "" {
		conversationId := query.Spec.ConversationId
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

	if approvalMeta := extractApprovalMetadata(result); approvalMeta != nil {
		tar, err := r.createToolApprovalRequest(ctx, &query, approvalMeta)
		if err != nil {
			return nil, engineResponseMeta{}, fmt.Errorf("failed to create ToolApprovalRequest: %w", err)
		}
		log.Info("ToolApprovalRequest created for query", "tar", tar.Name, "query", query.Name, "toolCalls", len(approvalMeta.ToolCalls))
		return &arkv1alpha1.Response{
			Target:  target,
			Content: "Waiting for tool approval",
			Phase:   "approval-required",
		}, engineResponseMeta{ApprovalRef: tar}, nil
	}

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
	ApprovalRef    *arkv1alpha1.ToolApprovalRequest
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
	if usage.TotalTokens > 0 {
		responseMeta.TokenUsage = usage
	}
}

type approvalMetadata struct {
	ToolCalls        []map[string]any
	ExecutionContext map[string]any
}

func extractApprovalMetadata(result *protocol.MessageResult) *approvalMetadata {
	if result == nil {
		return nil
	}
	msg, ok := result.Result.(*protocol.Message)
	if !ok || msg == nil || msg.Metadata == nil {
		return nil
	}
	approvalData, ok := msg.Metadata["ark.approval"].(map[string]any)
	if !ok {
		return nil
	}
	approvalRequired, _ := approvalData["approvalRequired"].(bool)
	if !approvalRequired {
		return nil
	}
	meta := &approvalMetadata{}
	if toolCalls, ok := approvalData["toolCalls"].([]any); ok {
		for _, tc := range toolCalls {
			if tcMap, ok := tc.(map[string]any); ok {
				meta.ToolCalls = append(meta.ToolCalls, tcMap)
			}
		}
	}
	if execCtx, ok := approvalData["executionContext"].(map[string]any); ok {
		meta.ExecutionContext = execCtx
	}
	return meta
}

func (r *QueryReconciler) createToolApprovalRequest(ctx context.Context, query *arkv1alpha1.Query, approvalMeta *approvalMetadata) (*arkv1alpha1.ToolApprovalRequest, error) {
	log := logf.FromContext(ctx)

	toolCalls := make([]arkv1alpha1.ToolCallInfo, len(approvalMeta.ToolCalls))
	for i, tc := range approvalMeta.ToolCalls {
		toolCalls[i] = arkv1alpha1.ToolCallInfo{
			ID:        tc["id"].(string),
			Name:      tc["name"].(string),
			Type:      tc["type"].(string),
			Arguments: tc["arguments"].(string),
		}
	}

	execCtx := arkv1alpha1.ExecutionContext{}
	if approvalMeta.ExecutionContext != nil {
		if name, ok := approvalMeta.ExecutionContext["agentName"].(string); ok {
			execCtx.AgentName = name
		}
		if ns, ok := approvalMeta.ExecutionContext["agentNamespace"].(string); ok {
			execCtx.AgentNamespace = ns
		}
		if history, ok := approvalMeta.ExecutionContext["conversationHistory"].(string); ok {
			execCtx.ConversationHistory = history
		}
		if idx, ok := approvalMeta.ExecutionContext["pendingToolCallIndex"].(float64); ok {
			execCtx.PendingToolCallIndex = int(idx)
		}
		if results, ok := approvalMeta.ExecutionContext["completedToolResults"].([]any); ok {
			for _, r := range results {
				if s, ok := r.(string); ok {
					execCtx.CompletedToolResults = append(execCtx.CompletedToolResults, s)
				}
			}
		}
	}

	tarName := fmt.Sprintf("tar-%s", query.Name)
	tar := &arkv1alpha1.ToolApprovalRequest{
		ObjectMeta: metav1.ObjectMeta{
			Name:      tarName,
			Namespace: query.Namespace,
		},
		Spec: arkv1alpha1.ToolApprovalRequestSpec{
			QueryRef: arkv1alpha1.QueryReference{
				Name:      query.Name,
				Namespace: query.Namespace,
			},
			ToolCalls:        toolCalls,
			ExecutionContext: execCtx,
		},
	}

	if err := controllerutil.SetControllerReference(query, tar, r.Scheme); err != nil {
		log.Error(err, "Failed to set controller reference on ToolApprovalRequest")
	}

	if err := r.Create(ctx, tar); err != nil {
		if errors.IsAlreadyExists(err) {
			if err := r.Get(ctx, types.NamespacedName{Name: tarName, Namespace: query.Namespace}, tar); err != nil {
				return nil, fmt.Errorf("failed to get existing ToolApprovalRequest: %w", err)
			}
			return tar, nil
		}
		return nil, fmt.Errorf("failed to create ToolApprovalRequest: %w", err)
	}

	log.Info("Created ToolApprovalRequest", "tar", tarName, "query", query.Name)
	return tar, nil
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
	if response != nil && response.Phase == statusError {
		return statusError
	}
	return statusDone
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
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Query{}).
		Named("query").
		Complete(r)
}
