/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/openai/openai-go"
	"go.opentelemetry.io/otel/attribute"
	corev1 "k8s.io/api/core/v1"
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
	"mckinsey.com/ark/internal/telemetry"
)

type targetResult struct {
	messages []genai.Message
	err      error
	target   arkv1alpha1.QueryTarget
}

type QueryReconciler struct {
	client.Client
	Scheme     *runtime.Scheme
	Recorder   record.EventRecorder
	operations sync.Map
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=models,verbs=get;list
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluators,verbs=get;list
// +kubebuilder:rbac:groups="",resources=events,verbs=create;list;watch;patch
// +kubebuilder:rbac:groups="",resources=serviceaccounts,resourceNames=default,verbs=impersonate

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
	case statusDone, statusError:
		return ctrl.Result{
			RequeueAfter: time.Until(expiry),
		}, nil
	case statusEvaluating:
		return r.handleEvaluationPhase(ctx, req, obj)
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

func (r *QueryReconciler) handleEvaluationPhase(ctx context.Context, req ctrl.Request, obj arkv1alpha1.Query) (ctrl.Result, error) {
	r.cleanupExistingOperation(req.NamespacedName)
	opCtx, cancel := context.WithCancel(ctx)
	r.operations.Store(req.NamespacedName, cancel)
	recorder := genai.NewQueryRecorder(&obj, r.Recorder)
	tokenCollector := genai.NewTokenUsageCollector(recorder)
	go r.executeEvaluation(opCtx, obj, req.NamespacedName, tokenCollector)
	return ctrl.Result{}, nil
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

	// Start session-aware query tracing
	sessionId := obj.Spec.SessionId
	if sessionId == "" {
		sessionId = string(obj.UID)
	}

	impersonatedClient, memory, err := r.setupQueryExecution(opCtx, obj, queryTracker, tokenCollector, sessionId)
	if err != nil {
		return
	}

	responses, err := r.reconcileQueue(opCtx, obj, impersonatedClient, memory, tokenCollector)
	if err != nil {
		queryTracker.Fail(err)
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	queryTracker.Complete("resolved")
	obj.Status.Responses = responses

	tokenSummary := tokenCollector.GetTokenSummary()
	obj.Status.TokenUsage = arkv1alpha1.TokenUsage{
		PromptTokens:     tokenSummary.PromptTokens,
		CompletionTokens: tokenSummary.CompletionTokens,
		TotalTokens:      tokenSummary.TotalTokens,
	}

	evaluators, evalErr := r.resolveEvaluators(opCtx, obj, impersonatedClient)
	if evalErr != nil {
		log.Error(evalErr, "Failed to resolve evaluators")
		_ = r.updateStatus(opCtx, &obj, statusError)
		return
	}

	if len(evaluators) > 0 {
		_ = r.updateStatus(opCtx, &obj, statusEvaluating)
		cleanupCache = false
	} else {
		_ = r.updateStatus(opCtx, &obj, statusDone)
	}

	duration := &metav1.Duration{Duration: time.Since(startTime)}
	if len(evaluators) > 0 {
		_ = r.updateStatusWithDuration(opCtx, &obj, statusEvaluating, duration)
		cleanupCache = false
	} else {
		_ = r.updateStatusWithDuration(opCtx, &obj, statusDone, duration)
	}
}

func (r *QueryReconciler) setupQueryExecution(opCtx context.Context, obj arkv1alpha1.Query, queryTracker *genai.OperationTracker, tokenCollector *genai.TokenUsageCollector, sessionId string) (client.Client, genai.MemoryInterface, error) {
	impersonatedClient, err := r.getClientForQuery(obj)
	if err != nil {
		queryTracker.Fail(fmt.Errorf("failed to create impersonated client: %w", err))
		_ = r.updateStatus(opCtx, &obj, statusError)
		return nil, nil, err
	}

	memory, err := genai.NewMemoryForQuery(opCtx, impersonatedClient, obj.Spec.Memory, obj.Namespace, tokenCollector, sessionId)
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

func (r *QueryReconciler) resolveEvaluators(ctx context.Context, query arkv1alpha1.Query, impersonatedClient client.Client) ([]arkv1alpha1.EvaluatorRef, error) {
	var allEvaluators []arkv1alpha1.EvaluatorRef

	allEvaluators = append(allEvaluators, query.Spec.Evaluators...)

	if query.Spec.EvaluatorSelector != nil {
		evaluators, err := r.resolveEvaluatorSelector(ctx, query.Spec.EvaluatorSelector, query.Namespace, impersonatedClient)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve evaluator selector: %w", err)
		}
		allEvaluators = append(allEvaluators, evaluators...)
	}

	return allEvaluators, nil
}

func (r *QueryReconciler) resolveEvaluatorSelector(ctx context.Context, selector *metav1.LabelSelector, namespace string, impersonatedClient client.Client) ([]arkv1alpha1.EvaluatorRef, error) {
	evaluators := make([]arkv1alpha1.EvaluatorRef, 0, 5)

	labelSelector, err := metav1.LabelSelectorAsSelector(selector)
	if err != nil {
		return nil, fmt.Errorf("invalid label selector: %w", err)
	}

	var evaluatorList arkv1alpha1.EvaluatorList
	if err := impersonatedClient.List(ctx, &evaluatorList, &client.ListOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
	}); err != nil {
		return nil, fmt.Errorf("failed to list evaluators: %w", err)
	}

	for _, evaluator := range evaluatorList.Items {
		evaluators = append(evaluators, arkv1alpha1.EvaluatorRef{
			Name:      evaluator.Name,
			Namespace: evaluator.Namespace,
		})
	}

	return evaluators, nil
}

func (r *QueryReconciler) reconcileQueue(ctx context.Context, query arkv1alpha1.Query, impersonatedClient client.Client, memory genai.MemoryInterface, tokenCollector *genai.TokenUsageCollector) ([]arkv1alpha1.Response, error) {
	targets, err := r.resolveTargets(ctx, query, impersonatedClient)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve targets: %w", err)
	}

	var allResponses []arkv1alpha1.Response
	resultChan := make(chan targetResult, len(targets))
	var wg sync.WaitGroup

	for _, target := range targets {
		wg.Add(1)
		go func(target arkv1alpha1.QueryTarget) {
			defer wg.Done()
			responses, err := r.executeTarget(ctx, query, target, impersonatedClient, memory, tokenCollector)
			resultChan <- targetResult{responses, err, target}
		}(target)
	}

	wg.Wait()
	close(resultChan)

	for result := range resultChan {
		if result.err != nil {
			return nil, result.err
		}
		// Skip targets that were delegated to external execution engines (messages == nil)
		if result.messages != nil {
			allResponses = append(allResponses, arkv1alpha1.Response{Target: result.target, Content: makeResponse(result.messages)})
		}
	}

	return allResponses, nil
}

func makeResponse(messages []genai.Message) string {
	lastMessage := messages[len(messages)-1]
	switch {
	case lastMessage.OfAssistant != nil:
		return lastMessage.OfAssistant.Content.OfString.Value
	case lastMessage.OfTool != nil:
		return lastMessage.OfTool.Content.OfString.Value
	case lastMessage.OfUser != nil:
		return lastMessage.OfUser.Content.OfString.Value
	default:
		logf.Log.Info("unknown last message type", "message", lastMessage)
		return ""
	}
}

func (r *QueryReconciler) updateStatus(ctx context.Context, query *arkv1alpha1.Query, status string) error {
	return r.updateStatusWithDuration(ctx, query, status, nil)
}

func (r *QueryReconciler) updateStatusWithDuration(ctx context.Context, query *arkv1alpha1.Query, status string, duration *metav1.Duration) error {
	if ctx.Err() != nil {
		return nil
	}
	query.Status.Phase = status
	if duration != nil {
		query.Status.Duration = duration
	}
	err := r.Status().Update(ctx, query)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update query status", "status", status)
	}
	return err
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

func (r *QueryReconciler) executeTarget(ctx context.Context, query arkv1alpha1.Query, target arkv1alpha1.QueryTarget, impersonatedClient client.Client, memory genai.MemoryInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	// Create trace based on target type with input/output at trace level
	tracer := telemetry.NewTraceContext()
	ctx, span := tracer.StartSpan(ctx, fmt.Sprintf("query.%s", target.Type),
		attribute.String("target.type", target.Type),
		attribute.String("target.name", target.Name),
		attribute.String("query.name", query.Name),
		attribute.String("query.namespace", query.Namespace),
		attribute.String("input.value", query.Spec.Input),
	)
	defer span.End()

	timeout := 5 * time.Minute
	if query.Spec.Timeout != nil {
		timeout = query.Spec.Timeout.Duration
	}
	execCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var messages []genai.Message
	var err error

	switch target.Type {
	case "agent":
		messages, err = r.executeAgent(execCtx, query, target.Name, impersonatedClient, memory, tokenCollector)
	case "team":
		messages, err = r.executeTeam(execCtx, query, target.Name, impersonatedClient, memory, tokenCollector)
	case "model":
		messages, err = r.executeModel(execCtx, query, target.Name, impersonatedClient, memory, tokenCollector)
	case "tool":
		messages, err = r.executeTool(execCtx, query, target.Name, impersonatedClient, tokenCollector)
	default:
		panic(fmt.Errorf("unknown query target type:%s", target.Type))
	}

	metadata := map[string]string{"targetType": target.Type, "targetName": target.Name}

	if err != nil {
		telemetry.RecordError(span, err)
		event := genai.ExecutionEvent{
			BaseEvent: genai.BaseEvent{Name: target.Name, Metadata: metadata},
			Type:      target.Type,
		}
		tokenCollector.EmitEvent(ctx, corev1.EventTypeWarning, "TargetExecutionError", event)
	} else {
		// Set the final response as output at trace level
		if len(messages) > 0 {
			lastMessage := messages[len(messages)-1]
			responseContent := telemetry.ExtractMessageContentForTelemetry(openai.ChatCompletionMessageParamUnion(lastMessage))
			span.SetAttributes(attribute.String("output.value", responseContent))
		}
		telemetry.RecordSuccess(span)
		event := genai.ExecutionEvent{
			BaseEvent: genai.BaseEvent{Name: target.Name, Metadata: metadata},
			Type:      target.Type,
		}
		tokenCollector.EmitEvent(ctx, corev1.EventTypeNormal, "TargetExecutionComplete", event)
	}
	return messages, err
}

func (r *QueryReconciler) executeAgent(ctx context.Context, query arkv1alpha1.Query, agentName string, impersonatedClient client.Client, memory genai.MemoryInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	var agentCRD arkv1alpha1.Agent
	agentKey := types.NamespacedName{Name: agentName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, agentKey, &agentCRD); err != nil {
		return nil, fmt.Errorf("unable to get %v, error:%w", agentKey, err)
	}

	log := logf.FromContext(ctx)
	log.Info("executing agent", "agent", agentCRD.Name)

	// Regular agent execution
	agent, err := genai.MakeAgent(ctx, impersonatedClient, &agentCRD, tokenCollector)
	if err != nil {
		return nil, fmt.Errorf("unable to make agent %v, error:%w", agentKey, err)
	}

	messages, err := r.loadInitialMessages(ctx, memory)
	if err != nil {
		return nil, fmt.Errorf("unable to load initial messages: %w", err)
	}

	resolvedInput, err := genai.ResolveQueryInput(ctx, impersonatedClient, query.Namespace, query.Spec.Input, query.Spec.Parameters)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve query input: %w", err)
	}

	userMessage := genai.NewUserMessage(resolvedInput)

	responseMessages, err := agent.Execute(ctx, userMessage, messages)
	if err != nil {
		return nil, err
	}

	// Save new messages to memory (user message + response messages)
	newMessages := append([]genai.Message{userMessage}, responseMessages...)
	if err := memory.AddMessages(ctx, query.Name, newMessages); err != nil {
		return nil, fmt.Errorf("failed to save new messages to memory: %w", err)
	}

	return responseMessages, nil
}

func (r *QueryReconciler) executeTeam(ctx context.Context, query arkv1alpha1.Query, teamName string, impersonatedClient client.Client, memory genai.MemoryInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	var teamCRD arkv1alpha1.Team
	teamKey := types.NamespacedName{Name: teamName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, teamKey, &teamCRD); err != nil {
		return nil, fmt.Errorf("unable to fetch team %v, error:%w", teamKey, err)
	}

	team, err := genai.MakeTeam(ctx, impersonatedClient, &teamCRD, tokenCollector)
	if err != nil {
		return nil, fmt.Errorf("unable to make team %v, error:%w", teamKey, err)
	}

	messages, err := r.loadInitialMessages(ctx, memory)
	if err != nil {
		return nil, fmt.Errorf("unable to load initial messages: %w", err)
	}

	// Resolve query input with template parameters
	resolvedInput, err := genai.ResolveQueryInput(ctx, impersonatedClient, query.Namespace, query.Spec.Input, query.Spec.Parameters)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve query input: %w", err)
	}

	userMessage := genai.NewUserMessage(resolvedInput)

	responseMessages, err := team.Execute(ctx, userMessage, messages)
	if err != nil {
		return nil, err
	}

	// Save new messages to memory (user message + response messages)
	newMessages := append([]genai.Message{userMessage}, responseMessages...)
	if err := memory.AddMessages(ctx, query.Name, newMessages); err != nil {
		return nil, fmt.Errorf("failed to save new messages to memory: %w", err)
	}

	return responseMessages, nil
}

func (r *QueryReconciler) executeModel(ctx context.Context, query arkv1alpha1.Query, modelName string, impersonatedClient client.Client, memory genai.MemoryInterface, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) {
	var modelCRD arkv1alpha1.Model
	modelKey := types.NamespacedName{Name: modelName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, modelKey, &modelCRD); err != nil {
		return nil, fmt.Errorf("unable to get %v, error:%w", modelKey, err)
	}

	model, err := genai.LoadModel(ctx, impersonatedClient, &arkv1alpha1.AgentModelRef{Name: modelName, Namespace: query.Namespace}, query.Namespace)
	if err != nil {
		return nil, fmt.Errorf("unable to load model %v, error:%w", modelKey, err)
	}

	messages, err := r.loadInitialMessages(ctx, memory)
	if err != nil {
		return nil, fmt.Errorf("unable to load initial messages: %w", err)
	}

	// Resolve query input with template parameters
	resolvedInput, err := genai.ResolveQueryInput(ctx, impersonatedClient, query.Namespace, query.Spec.Input, query.Spec.Parameters)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve query input: %w", err)
	}

	userMessage := genai.NewUserMessage(resolvedInput)

	// Append user message to conversation history
	messages = append(messages, userMessage)
	allMessages := messages

	// Create operation tracker for the model call
	modelTracker := genai.NewOperationTracker(tokenCollector, ctx, "ModelCall", modelName, map[string]string{
		"model": modelName,
		"type":  "direct",
	})

	// Call model directly with chat completion
	completion, err := model.ChatCompletion(ctx, allMessages, nil)
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
	modelTracker.CompleteWithTokens("", tokenUsage)

	if len(completion.Choices) == 0 {
		return nil, fmt.Errorf("model returned no completion choices")
	}

	choice := completion.Choices[0]
	assistantMessage := genai.NewAssistantMessage(choice.Message.Content)

	responseMessages := []genai.Message{assistantMessage}

	// Save new messages to memory (user message + response messages)
	newMessages := append([]genai.Message{userMessage}, responseMessages...)
	if err := memory.AddMessages(ctx, query.Name, newMessages); err != nil {
		return nil, fmt.Errorf("failed to save new messages to memory: %w", err)
	}

	return responseMessages, nil
}

func (r *QueryReconciler) executeTool(ctx context.Context, query arkv1alpha1.Query, toolName string, impersonatedClient client.Client, tokenCollector *genai.TokenUsageCollector) ([]genai.Message, error) { //nolint:unparam
	// tokenCollector parameter is kept for consistency with other execute methods but not used since tools don't consume tokens
	log := logf.FromContext(ctx)

	var toolCRD arkv1alpha1.Tool
	toolKey := types.NamespacedName{Name: toolName, Namespace: query.Namespace}

	if err := impersonatedClient.Get(ctx, toolKey, &toolCRD); err != nil {
		return nil, fmt.Errorf("unable to get tool %v, error:%w", toolKey, err)
	}

	// Resolve query input with template parameters (this will be the tool arguments)
	resolvedInput, err := genai.ResolveQueryInput(ctx, impersonatedClient, query.Namespace, query.Spec.Input, query.Spec.Parameters)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve query input: %w", err)
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

	toolRegistry := genai.NewToolRegistry()
	defer func() {
		if err := toolRegistry.Close(); err != nil {
			// Log the error but don't fail the request since tool execution already succeeded
			log.Error(err, "Failed to close MCP client connections in tool registry")
		}
		log.Info("MCP client connections closed successfully")
	}()

	toolDefinition := genai.CreateToolFromCRD(&toolCRD)
	// Pass the tool registry's MCP pool to CreateToolExecutor
	executor, err := genai.CreateToolExecutor(ctx, impersonatedClient, &toolCRD, query.Namespace, toolRegistry.GetMCPPool())
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
	// Skip impersonation in dev mode
	if os.Getenv("SKIP_IMPERSONATION") == "true" {
		return r.Client, nil
	}

	serviceAccount := query.Spec.ServiceAccount
	if serviceAccount == "" {
		serviceAccount = "default"
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

func (r *QueryReconciler) executeEvaluation(ctx context.Context, obj arkv1alpha1.Query, namespacedName types.NamespacedName, tokenCollector *genai.TokenUsageCollector) {
	log := logf.FromContext(ctx)
	defer func() {
		if r := recover(); r != nil {
			log.Error(fmt.Errorf("evaluation goroutine panic: %v", r), "Evaluation goroutine panicked")
		}
		r.operations.Delete(namespacedName)
	}()

	startTime := time.Now()

	impersonatedClient, err := r.getClientForQuery(obj)
	if err != nil {
		log.Error(err, "Failed to create impersonated client for evaluation", "duration", time.Since(startTime))
		if updateErr := r.updateStatus(ctx, &obj, statusError); updateErr != nil {
			log.Error(updateErr, "Failed to update status")
		}
		return
	}

	evaluators, err := r.resolveEvaluators(ctx, obj, impersonatedClient)
	if err != nil {
		log.Error(err, "Failed to resolve evaluators", "duration", time.Since(startTime))
		if updateErr := r.updateStatus(ctx, &obj, statusError); updateErr != nil {
			log.Error(updateErr, "Failed to update status")
		}
		return
	}

	evaluationResults, err := genai.CallEvaluators(ctx, impersonatedClient, obj, evaluators, tokenCollector)
	duration := time.Since(startTime)

	if err != nil {
		log.Error(err, "Evaluation failed", "duration", duration)
		if updateErr := r.updateStatus(ctx, &obj, statusError); updateErr != nil {
			log.Error(updateErr, "Failed to update status")
		}
	} else {
		obj.Status.Evaluations = evaluationResults
		if updateErr := r.updateStatus(ctx, &obj, statusDone); updateErr != nil {
			log.Error(updateErr, "Failed to update status")
		}
	}
}

func (r *QueryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Query{}).
		Named("query").
		Complete(r)
}
