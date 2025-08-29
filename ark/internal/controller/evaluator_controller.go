/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

// EvaluatorReconciler reconciles an Evaluator object
type EvaluatorReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	resolver *common.ValueSourceResolver
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluators,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluators/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluators/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluations,verbs=get;list;watch;create;update;patch
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

func (r *EvaluatorReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var evaluator arkv1alpha1.Evaluator
	if err := r.Get(ctx, req.NamespacedName, &evaluator); err != nil {
		if errors.IsNotFound(err) {
			log.Info("Evaluator deleted", "evaluator", req.Name)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch Evaluator")
		return ctrl.Result{}, err
	}

	// State machine approach following Memory pattern
	switch evaluator.Status.Phase {
	case statusReady:
		// For ready evaluators with selectors, process selector logic
		if evaluator.Spec.Selector != nil {
			if err := r.processEvaluatorWithSelector(ctx, &evaluator); err != nil {
				log.Error(err, "failed to process evaluator selector in ready state", "evaluator", evaluator.Name)
				return ctrl.Result{}, err
			}
		}
		return ctrl.Result{}, nil
	case statusError:
		// Terminal error state - no further processing needed
		return ctrl.Result{}, nil
	case statusRunning:
		// Continue processing
		return r.processEvaluator(ctx, evaluator)
	default:
		// Initialize to running state
		if err := r.updateStatus(ctx, evaluator, statusRunning, "Resolving evaluator address"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}
}

func (r *EvaluatorReconciler) getResolver() *common.ValueSourceResolver {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolver(r.Client)
	}
	return r.resolver
}

func (r *EvaluatorReconciler) processEvaluator(ctx context.Context, evaluator arkv1alpha1.Evaluator) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Processing evaluator", "evaluator", evaluator.Name)

	// First, resolve the evaluator address
	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, evaluator.Spec.Address, evaluator.Namespace)
	if err != nil {
		log.Error(err, "failed to resolve Evaluator address", "evaluator", evaluator.Name)
		if err := r.updateStatus(ctx, evaluator, statusError, fmt.Sprintf("Failed to resolve address: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Update resolved address in status
	evaluator.Status.LastResolvedAddress = resolvedAddress

	// If evaluator has selector, process matching queries
	if evaluator.Spec.Selector != nil {
		if err := r.processEvaluatorWithSelector(ctx, &evaluator); err != nil {
			log.Error(err, "failed to process evaluator with selector", "evaluator", evaluator.Name)
			if err := r.updateStatus(ctx, evaluator, statusError, fmt.Sprintf("Failed to process selector: %v", err)); err != nil {
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}
	}

	// Mark as ready
	if err := r.updateStatus(ctx, evaluator, statusReady, "Evaluator address resolved successfully"); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("Evaluator processed successfully", "evaluator", evaluator.Name, "resolvedAddress", resolvedAddress)
	return ctrl.Result{}, nil
}

func (r *EvaluatorReconciler) updateStatus(ctx context.Context, evaluator arkv1alpha1.Evaluator, phase, message string) error {
	log := logf.FromContext(ctx)

	evaluator.Status.Phase = phase
	evaluator.Status.Message = message

	if err := r.Status().Update(ctx, &evaluator); err != nil {
		log.Error(err, "failed to update Evaluator status", "evaluator", evaluator.Name)
		return err
	}

	log.Info("Updated Evaluator status", "evaluator", evaluator.Name, "phase", phase, "message", message)
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *EvaluatorReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Evaluator{}).
		Watches(&arkv1alpha1.Query{}, handler.EnqueueRequestsFromMapFunc(r.findEvaluatorsForQuery)).
		Named("evaluator").
		Complete(r)
}

// resolveEvaluatorParameters resolves evaluator parameters from various sources
func (r *EvaluatorReconciler) resolveEvaluatorParameters(ctx context.Context, params []arkv1alpha1.Parameter, namespace string) ([]arkv1alpha1.Parameter, error) {
	resolved := make([]arkv1alpha1.Parameter, 0, len(params))

	for _, param := range params {
		resolvedParam := arkv1alpha1.Parameter{Name: param.Name}

		if param.Value != "" {
			resolvedParam.Value = param.Value
		} else if param.ValueFrom != nil {
			value, err := r.resolveParameterValue(ctx, param.ValueFrom, namespace)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve parameter %s: %w", param.Name, err)
			}
			resolvedParam.Value = value
		}

		resolved = append(resolved, resolvedParam)
	}

	return resolved, nil
}

// resolveParameterValue resolves a parameter value from ConfigMap sources
func (r *EvaluatorReconciler) resolveParameterValue(ctx context.Context, valueFrom *arkv1alpha1.ValueFromSource, namespace string) (string, error) {
	if valueFrom.ConfigMapKeyRef != nil {
		return r.resolveConfigMapKeyRef(ctx, valueFrom.ConfigMapKeyRef, namespace)
	}

	if valueFrom.SecretKeyRef != nil {
		return r.resolveSecretKeyRef(ctx, valueFrom.SecretKeyRef, namespace)
	}

	return "", fmt.Errorf("no valid value source specified")
}

// resolveConfigMapKeyRef resolves a value from a specific ConfigMap key
func (r *EvaluatorReconciler) resolveConfigMapKeyRef(ctx context.Context, keyRef *corev1.ConfigMapKeySelector, namespace string) (string, error) {
	var configMap corev1.ConfigMap
	configMapKey := client.ObjectKey{
		Name:      keyRef.Name,
		Namespace: namespace,
	}

	if err := r.Get(ctx, configMapKey, &configMap); err != nil {
		if keyRef.Optional != nil && *keyRef.Optional {
			return "", nil
		}
		return "", fmt.Errorf("failed to get ConfigMap %s: %w", keyRef.Name, err)
	}

	value, exists := configMap.Data[keyRef.Key]
	if !exists {
		if keyRef.Optional != nil && *keyRef.Optional {
			return "", nil
		}
		return "", fmt.Errorf("key %s not found in ConfigMap %s", keyRef.Key, keyRef.Name)
	}

	return value, nil
}

// resolveSecretKeyRef resolves a value from a specific Secret key
func (r *EvaluatorReconciler) resolveSecretKeyRef(ctx context.Context, keyRef *corev1.SecretKeySelector, namespace string) (string, error) {
	var secret corev1.Secret
	secretKey := client.ObjectKey{
		Name:      keyRef.Name,
		Namespace: namespace,
	}

	if err := r.Get(ctx, secretKey, &secret); err != nil {
		return "", fmt.Errorf("failed to get Secret %s/%s: %w", namespace, keyRef.Name, err)
	}

	value, exists := secret.Data[keyRef.Key]
	if !exists {
		return "", fmt.Errorf("key '%s' not found in Secret %s/%s", keyRef.Key, namespace, keyRef.Name)
	}

	return string(value), nil
}

// findEvaluatorsForQuery maps query changes to evaluator reconcile requests
func (r *EvaluatorReconciler) findEvaluatorsForQuery(ctx context.Context, obj client.Object) []reconcile.Request {
	query := obj.(*arkv1alpha1.Query)
	var evaluators arkv1alpha1.EvaluatorList

	if err := r.List(ctx, &evaluators, client.InNamespace(query.Namespace)); err != nil {
		return nil
	}

	var requests []reconcile.Request
	for _, evaluator := range evaluators.Items {
		if r.queryMatchesEvaluator(query, &evaluator) {
			requests = append(requests, reconcile.Request{
				NamespacedName: types.NamespacedName{
					Name:      evaluator.Name,
					Namespace: evaluator.Namespace,
				},
			})
		}
	}
	return requests
}

// queryMatchesEvaluator checks if a query matches an evaluator's selector
func (r *EvaluatorReconciler) queryMatchesEvaluator(query *arkv1alpha1.Query, evaluator *arkv1alpha1.Evaluator) bool {
	if evaluator.Spec.Selector == nil {
		return false
	}

	selector := evaluator.Spec.Selector

	// Check resource type
	if selector.ResourceType != "Query" {
		return false
	}

	// Build label selector
	labelSelector := &metav1.LabelSelector{
		MatchLabels:      selector.MatchLabels,
		MatchExpressions: selector.MatchExpressions,
	}

	selectorObj, err := metav1.LabelSelectorAsSelector(labelSelector)
	if err != nil {
		return false
	}

	return selectorObj.Matches(labels.Set(query.Labels))
}

// processEvaluatorWithSelector handles selector-based evaluation logic
func (r *EvaluatorReconciler) processEvaluatorWithSelector(ctx context.Context, evaluator *arkv1alpha1.Evaluator) error {
	log := logf.FromContext(ctx)
	log.Info("Processing evaluator with selector", "evaluator", evaluator.Name)

	// Find matching queries
	matchingQueries, err := r.findMatchingQueries(ctx, evaluator)
	if err != nil {
		return fmt.Errorf("failed to find matching queries: %w", err)
	}

	log.Info("Found matching queries", "evaluator", evaluator.Name, "count", len(matchingQueries))

	// Process each matching query
	for _, query := range matchingQueries {
		if query.Status.Phase == statusDone {
			if err := r.createEvaluationForQuery(ctx, evaluator, &query); err != nil {
				log.Error(err, "Failed to create evaluation", "evaluator", evaluator.Name, "query", query.Name)
				continue
			}
		}
	}

	return nil
}

// findMatchingQueries finds queries that match the evaluator's selector
func (r *EvaluatorReconciler) findMatchingQueries(ctx context.Context, evaluator *arkv1alpha1.Evaluator) ([]arkv1alpha1.Query, error) {
	selector := evaluator.Spec.Selector

	// Build label selector
	labelSelector := &metav1.LabelSelector{
		MatchLabels:      selector.MatchLabels,
		MatchExpressions: selector.MatchExpressions,
	}

	selectorObj, err := metav1.LabelSelectorAsSelector(labelSelector)
	if err != nil {
		return nil, err
	}

	var queries arkv1alpha1.QueryList
	opts := &client.ListOptions{
		Namespace:     evaluator.Namespace,
		LabelSelector: selectorObj,
	}

	if err := r.List(ctx, &queries, opts); err != nil {
		return nil, err
	}

	return queries.Items, nil
}

// createEvaluationForQuery creates an evaluation for a specific query
func (r *EvaluatorReconciler) createEvaluationForQuery(ctx context.Context, evaluator *arkv1alpha1.Evaluator, query *arkv1alpha1.Query) error {
	log := logf.FromContext(ctx)

	// Check if evaluation already exists
	evaluationName := fmt.Sprintf("%s-%s-eval", evaluator.Name, query.Name)

	var existingEval arkv1alpha1.Evaluation
	evalKey := client.ObjectKey{Name: evaluationName, Namespace: evaluator.Namespace}

	if err := r.Get(ctx, evalKey, &existingEval); err == nil {
		// Evaluation exists, check if query changed
		if r.shouldRetriggerEvaluation(&existingEval, query) {
			return r.updateEvaluationForQuery(ctx, &existingEval, evaluator, query)
		}
		log.Info("Evaluation already exists and is up to date", "evaluation", evaluationName)
		return nil // Already evaluated
	}

	// Resolve parameters
	parameters, err := r.resolveEvaluatorParameters(ctx, evaluator.Spec.Parameters, evaluator.Namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve parameters: %w", err)
	}

	// Create new evaluation
	evaluation := &arkv1alpha1.Evaluation{
		ObjectMeta: metav1.ObjectMeta{
			Name:      evaluationName,
			Namespace: evaluator.Namespace,
			Labels: map[string]string{
				"ark.mckinsey.com/evaluator": evaluator.Name,
				"ark.mckinsey.com/query":     query.Name,
				"ark.mckinsey.com/auto":      "true",
			},
			Annotations: map[string]string{
				"ark.mckinsey.com/query-generation": fmt.Sprintf("%d", query.Generation),
				"ark.mckinsey.com/query-phase":      query.Status.Phase,
			},
		},
		Spec: arkv1alpha1.EvaluationSpec{
			Type: "query",
			Config: arkv1alpha1.EvaluationConfig{
				QueryBasedEvaluationConfig: &arkv1alpha1.QueryBasedEvaluationConfig{
					QueryRef: &arkv1alpha1.QueryRef{
						Name:           query.Name,
						Namespace:      query.Namespace,
						ResponseTarget: "", // Default to first response
					},
				},
			},
			Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
				Name:       evaluator.Name,
				Namespace:  evaluator.Namespace,
				Parameters: parameters,
			},
		},
	}

	log.Info("Creating evaluation for query", "evaluation", evaluationName, "query", query.Name)
	return r.Create(ctx, evaluation)
}

// shouldRetriggerEvaluation checks if evaluation should be retriggered based on query changes
func (r *EvaluatorReconciler) shouldRetriggerEvaluation(evaluation *arkv1alpha1.Evaluation, query *arkv1alpha1.Query) bool {
	// Check if query generation has changed
	currentGeneration := fmt.Sprintf("%d", query.Generation)
	lastGeneration := evaluation.Annotations["ark.mckinsey.com/query-generation"]

	if currentGeneration != lastGeneration {
		return true
	}

	// Check if query phase has changed to "done"
	currentPhase := query.Status.Phase
	lastPhase := evaluation.Annotations["ark.mckinsey.com/query-phase"]

	return currentPhase == "done" && currentPhase != lastPhase
}

// updateEvaluationForQuery updates an existing evaluation to retrigger evaluation
func (r *EvaluatorReconciler) updateEvaluationForQuery(ctx context.Context, evaluation *arkv1alpha1.Evaluation, evaluator *arkv1alpha1.Evaluator, query *arkv1alpha1.Query) error {
	log := logf.FromContext(ctx)

	// Update annotations to reflect query changes
	if evaluation.Annotations == nil {
		evaluation.Annotations = make(map[string]string)
	}
	evaluation.Annotations["ark.mckinsey.com/query-generation"] = fmt.Sprintf("%d", query.Generation)
	evaluation.Annotations["ark.mckinsey.com/query-phase"] = query.Status.Phase

	// Resolve and update parameters
	parameters, err := r.resolveEvaluatorParameters(ctx, evaluator.Spec.Parameters, evaluator.Namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve parameters: %w", err)
	}
	evaluation.Spec.Evaluator.Parameters = parameters

	// Reset evaluation status to trigger re-evaluation
	evaluation.Status.Phase = ""
	evaluation.Status.Message = ""
	evaluation.Status.Score = ""
	evaluation.Status.Passed = false

	log.Info("Updating evaluation for retriggering", "evaluation", evaluation.Name, "query", query.Name)
	return r.Update(ctx, evaluation)
}
