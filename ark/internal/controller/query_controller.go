/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"go.opentelemetry.io/otel/baggage"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	completions "mckinsey.com/ark/executors/completions"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
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

	go r.executeQueryAsync(opCtx, obj, req.NamespacedName)
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
	if member, err := baggage.NewMember("session.id", sessionId); err == nil {
		if bag, err := baggage.New(member); err == nil {
			opCtx = baggage.ContextWithBaggage(opCtx, bag)
		}
	}

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
	dispatchSpan.SetStatus(telemetry.StatusOk, "success")

	obj.Status.Response = response

	if engineMeta.TokenUsage != nil {
		obj.Status.TokenUsage = *engineMeta.TokenUsage
	}
	if engineMeta.ConversationId != "" {
		obj.Status.ConversationId = engineMeta.ConversationId
	}

	queryStatus := r.determineQueryStatus(response)
	duration := &metav1.Duration{Duration: time.Since(startTime)}
	_ = r.updateStatusWithDuration(opCtx, &obj, queryStatus, duration)

	log.Info("query execution completed", "query", obj.Name, "status", queryStatus, "duration", duration.Duration)
	r.Eventing.QueryRecorder().Complete(opCtx, "QueryExecution", "Query execution completed", nil)
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
	message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart(userText),
	})
	message.Metadata = metadata
	message.Extensions = []string{arka2a.QueryExtensionURI}

	a2aClient, err := arka2a.CreateA2AClient(ctx, r.Client, address, nil, query.Namespace, query.Name, nil)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to create A2A client: %w", err)
	}

	timeout := 5 * time.Minute
	if query.Spec.Timeout != nil {
		timeout = query.Spec.Timeout.Duration
	}
	execCtx, cancel := context.WithTimeout(ctx, timeout)
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

	responseText, err := extractA2AResponseText(result)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to extract response: %w", err)
	}

	engineMeta := extractEngineResponseMeta(result)

	log.V(1).Info("query A2A call completed", "query", query.Name, "target", target.Name, "address", address)

	rawJSON := engineMeta.MessagesRaw
	if rawJSON == "" {
		responseMessages := []completions.Message{completions.NewAssistantMessage(responseText)}
		rawJSON = serializeMessages(responseMessages)
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
	inputMessages, err := completions.GetQueryInputMessages(ctx, query, k8sClient)
	if err != nil {
		return ""
	}
	return completions.ExtractUserMessageContent(inputMessages)
}

func serializeMessages(messages []completions.Message) string {
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
		}
	}
	rawBytes, err := json.Marshal(actualMessages)
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

	var msgMeta map[string]any
	if msg, ok := result.Result.(*protocol.Message); ok {
		msgMeta = msg.Metadata
	}

	if msgMeta == nil {
		return responseMeta
	}

	arkData, ok := msgMeta[arka2a.QueryExtensionMetadataKey]
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
		if query.Status.Response != nil && query.Status.Response.Phase == statusError && query.Status.Response.Content != "" {
			errorMsg = query.Status.Response.Content
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
