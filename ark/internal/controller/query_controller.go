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

	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	"mckinsey.com/ark/internal/genai"
)

const (
	targetTypeAgent = "agent"
	targetTypeTeam  = "team"
	targetTypeModel = "model"
	targetTypeTool  = "tool"
)

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
	Scheme          *runtime.Scheme
	Eventing        *eventingconfig.Provider
	QueryEngineAddr string
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

	impersonatedClient, err := r.getClientForQuery(obj)
	if err != nil {
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	target, err := r.resolveTarget(opCtx, obj, impersonatedClient)
	if err != nil {
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Failed to resolve target: %v", err), err, nil)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	response, engineMeta, err := r.executeViaEngine(opCtx, obj, *target)
	if err != nil {
		r.Eventing.QueryRecorder().Fail(opCtx, "QueryExecution", fmt.Sprintf("Query execution failed: %v", err), err, nil)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

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


func (r *QueryReconciler) executeViaEngine(ctx context.Context, query arkv1alpha1.Query, target arkv1alpha1.QueryTarget) (*arkv1alpha1.Response, engineResponseMeta, error) {
	log := logf.FromContext(ctx)

	agentConfig, err := r.buildAgentConfigForEngine(ctx, query, target)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to build agent config: %w", err)
	}

	arkMetadata := map[string]any{
		"agent": agentConfig,
		"tools": []any{},
		"history": []any{},
		"query": map[string]string{
			"name":      query.Name,
			"namespace": query.Namespace,
		},
	}

	metadataBytes, err := json.Marshal(map[string]any{
		genai.ArkMetadataKey: arkMetadata,
	})
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to marshal A2A metadata: %w", err)
	}

	var metadata map[string]any
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to prepare A2A metadata: %w", err)
	}

	userText := r.extractUserInput(ctx, query)
	message := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart(userText),
	})
	message.Metadata = metadata

	a2aClient, err := genai.CreateA2AClient(ctx, r.Client, r.QueryEngineAddr, nil, query.Namespace, query.Name, nil)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to create A2A client for query engine: %w", err)
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
		return nil, engineResponseMeta{}, fmt.Errorf("query engine execution failed: %w", err)
	}

	responseText, err := extractA2AResponseText(result)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to extract response from query engine: %w", err)
	}

	engineMeta := extractEngineResponseMeta(result)

	log.Info("query engine execution completed", "query", query.Name, "target", target.Name)

	responseMessages := []genai.Message{genai.NewAssistantMessage(responseText)}
	rawJSON, err := serializeMessages(responseMessages)
	if err != nil {
		return nil, engineResponseMeta{}, fmt.Errorf("failed to serialize response: %w", err)
	}

	response := &arkv1alpha1.Response{
		Target:  target,
		Content: responseText,
		Raw:     rawJSON,
		Phase:   statusDone,
	}

	return response, engineMeta, nil
}

func (r *QueryReconciler) buildAgentConfigForEngine(ctx context.Context, query arkv1alpha1.Query, target arkv1alpha1.QueryTarget) (map[string]any, error) {
	return map[string]any{
		"name":      target.Name,
		"namespace": query.Namespace,
		"prompt":    "",
	}, nil
}

func (r *QueryReconciler) extractUserInput(ctx context.Context, query arkv1alpha1.Query) string {
	inputMessages, err := genai.GetQueryInputMessages(ctx, query, r.Client)
	if err != nil {
		return ""
	}
	return genai.ExtractUserMessageContent(inputMessages)
}

func extractA2AResponseText(result *protocol.MessageResult) (string, error) {
	if result == nil {
		return "", fmt.Errorf("nil result from query engine")
	}

	switch r := result.Result.(type) {
	case *protocol.Message:
		return genai.ExtractTextFromParts(r.Parts), nil
	case *protocol.Task:
		if r.Status.Message != nil {
			return genai.ExtractTextFromParts(r.Status.Message.Parts), nil
		}
		for _, artifact := range r.Artifacts {
			text := genai.ExtractTextFromParts(artifact.Parts)
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
}

func extractEngineResponseMeta(result *protocol.MessageResult) engineResponseMeta {
	var meta engineResponseMeta
	if result == nil {
		return meta
	}

	var msgMeta map[string]any
	switch r := result.Result.(type) {
	case *protocol.Message:
		msgMeta = r.Metadata
	}

	if msgMeta == nil {
		return meta
	}

	arkData, ok := msgMeta[genai.ArkMetadataKey]
	if !ok {
		return meta
	}

	arkMap, ok := arkData.(map[string]any)
	if !ok {
		return meta
	}

	if convId, ok := arkMap["conversationId"].(string); ok {
		meta.ConversationId = convId
	}

	if tokenData, ok := arkMap["tokenUsage"].(map[string]any); ok {
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
			meta.TokenUsage = usage
		}
	}

	return meta
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




func (r *QueryReconciler) createSuccessResponse(target arkv1alpha1.QueryTarget, messages []genai.Message) arkv1alpha1.Response {
	rawJSON, err := serializeMessages(messages)
	if err != nil {
		serializationErr := fmt.Errorf("failed to serialize messages for target %v: %w", target, err)
		return r.createErrorResponse(target, serializationErr)
	}

	content := lastResponseContent(messages)

	return arkv1alpha1.Response{
		Target:  target,
		Content: content,
		Raw:     rawJSON,
		Phase:   statusDone,
	}
}

func lastResponseContent(messages []genai.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].OfSystem != nil {
			continue
		}
		text := messageToText(messages[i])
		if text != "" {
			return text
		}
	}
	if len(messages) > 0 {
		return messageToText(messages[len(messages)-1])
	}
	return ""
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

// determineQueryStatus checks if any responses have error phase and returns appropriate query status
func (r *QueryReconciler) determineQueryStatus(response *arkv1alpha1.Response) string {
	if response != nil && response.Phase == statusError {
		return statusError
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


func (r *QueryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Query{}).
		Named("query").
		Complete(r)
}
