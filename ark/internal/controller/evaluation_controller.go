/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/genai"
)

const (
	paramModelNamespace = "model.namespace"
	paramModelName      = "model.name"
)

// EvaluationReconciler reconciles an Evaluation object
type EvaluationReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
	resolver *common.ValueSourceResolver
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluations,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluations/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluations/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=evaluators,verbs=get;list;watch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=queries,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

func (r *EvaluationReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var evaluation arkv1alpha1.Evaluation
	if err := r.Get(ctx, req.NamespacedName, &evaluation); err != nil {
		if errors.IsNotFound(err) {
			log.Info("Evaluation deleted", "evaluation", req.Name)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch Evaluation")
		return ctrl.Result{}, err
	}

	// Simple state machine - if already done or error, do nothing
	if evaluation.Status.Phase == statusDone || evaluation.Status.Phase == statusError {
		return ctrl.Result{}, nil
	}

	// If not running, set to running
	if evaluation.Status.Phase != statusRunning {
		if err := r.updateStatus(ctx, evaluation, statusRunning, "Starting evaluation"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Process the evaluation
	return r.processEvaluation(ctx, evaluation)
}

func (r *EvaluationReconciler) getResolver() *common.ValueSourceResolver {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolver(r.Client)
	}
	return r.resolver
}

func (r *EvaluationReconciler) processEvaluation(ctx context.Context, evaluation arkv1alpha1.Evaluation) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Processing evaluation", "evaluation", evaluation.Name, "type", evaluation.Spec.Type)

	// Validate evaluator reference
	if err := r.validateEvaluatorRef(ctx, evaluation); err != nil {
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Evaluator validation failed: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Process based on type
	switch evaluation.Spec.Type {
	case "direct", "": // Default to direct type
		return r.processDirectEvaluation(ctx, evaluation)
	case "query":
		return r.processQueryEvaluation(ctx, evaluation)
	case "batch":
		return r.processBatchEvaluation(ctx, evaluation)
	case "baseline":
		return r.processBaselineEvaluation(ctx, evaluation)
	case "event":
		return r.processEventEvaluation(ctx, evaluation)
	default:
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Unsupported evaluation type: %s", evaluation.Spec.Type)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}
}

func (r *EvaluationReconciler) validateEvaluatorRef(ctx context.Context, evaluation arkv1alpha1.Evaluation) error {
	// Resolve evaluator namespace
	evaluatorNamespace := evaluation.Spec.Evaluator.Namespace
	if evaluatorNamespace == "" {
		evaluatorNamespace = evaluation.Namespace
	}

	// Check if evaluator exists
	var evaluator arkv1alpha1.Evaluator
	evaluatorKey := client.ObjectKey{
		Name:      evaluation.Spec.Evaluator.Name,
		Namespace: evaluatorNamespace,
	}

	if err := r.Get(ctx, evaluatorKey, &evaluator); err != nil {
		if errors.IsNotFound(err) {
			return fmt.Errorf("evaluator '%s' not found in namespace '%s'", evaluation.Spec.Evaluator.Name, evaluatorNamespace)
		}
		return fmt.Errorf("failed to fetch evaluator: %v", err)
	}

	// Check if evaluator is ready
	if evaluator.Status.Phase != statusReady {
		return fmt.Errorf("evaluator '%s' is not ready (current phase: %s)", evaluation.Spec.Evaluator.Name, evaluator.Status.Phase)
	}

	return nil
}

// convertParametersToMap converts evaluation parameters to string map, resolving ValueFrom references
func (r *EvaluationReconciler) convertParametersToMap(ctx context.Context, params []arkv1alpha1.Parameter, namespace string) map[string]string {
	log := logf.FromContext(ctx)
	log.Info("Converting parameters to map", "params", params, "namespace", namespace)

	paramMap := make(map[string]string)
	resolver := r.getResolver()

	// First pass: resolve all parameters except model.namespace
	var modelNamespaceParam *arkv1alpha1.Parameter
	var modelNameParam *arkv1alpha1.Parameter

	for _, param := range params {
		log.Info("Processing parameter", "paramName", param.Name, "paramValue", param.Value, "paramValueFrom", param.ValueFrom)
		if param.Name == paramModelNamespace {
			modelNamespaceParam = &param
			continue
		}
		if param.Name == paramModelName {
			modelNameParam = &param
		}

		// If parameter has a direct value, use it
		if param.Value != "" {
			paramMap[param.Name] = param.Value
			if param.Name == paramModelName {
				log.Info("Added model.name to parameter map", "paramName", param.Name, "paramValue", param.Value)
			}
			continue
		}

		// If parameter has ValueFrom, resolve it
		if param.ValueFrom != nil {
			valueSource := arkv1alpha1.ValueSource{
				ValueFrom: param.ValueFrom,
			}
			resolvedValue, err := resolver.ResolveValueSource(ctx, valueSource, namespace)
			if err != nil {
				log := logf.FromContext(ctx)
				log.Error(err, "Failed to resolve parameter valueFrom", "parameter", param.Name)
				continue
			}
			paramMap[param.Name] = resolvedValue
		}
	}

	// Handle model.namespace parameter with validation logic
	modelNamespaceValue := r.resolveModelNamespace(ctx, modelNamespaceParam, modelNameParam, paramMap, namespace)
	paramMap[paramModelNamespace] = modelNamespaceValue

	log.Info("Final parameter map", "paramMap", paramMap)

	return paramMap
}

// resolveModelNamespace determines the appropriate model namespace with validation and fallback logic
func (r *EvaluationReconciler) resolveModelNamespace(ctx context.Context, modelNamespaceParam, modelNameParam *arkv1alpha1.Parameter, paramMap map[string]string, defaultNamespace string) string {
	log := logf.FromContext(ctx)

	// If no model.namespace parameter provided, use default namespace
	if modelNamespaceParam == nil {
		log.Info("Adding default model.namespace parameter", "namespace", defaultNamespace)
		return defaultNamespace
	}

	// Resolve the provided model.namespace parameter
	candidateNamespace := r.resolveParameterValue(ctx, modelNamespaceParam, defaultNamespace)
	if candidateNamespace == "" {
		log.Info("Invalid model.namespace parameter, using evaluation namespace", "namespace", defaultNamespace)
		return defaultNamespace
	}

	// Get the model name to validate against
	modelName := r.getModelNameFromParameters(modelNameParam, paramMap)
	if modelName == "" {
		log.Info("No model.name parameter found, using evaluation namespace for model.namespace", "namespace", defaultNamespace)
		return defaultNamespace
	}

	// Validate if the model exists in the candidate namespace
	if r.modelExistsInNamespace(ctx, modelName, candidateNamespace) {
		log.Info("Using provided model.namespace parameter", "namespace", candidateNamespace, "modelName", modelName)
		return candidateNamespace
	}

	// Model doesn't exist in candidate namespace, fall back to evaluation's namespace
	log.Info("Model not found in provided namespace, falling back to evaluation namespace",
		"providedNamespace", candidateNamespace, "fallbackNamespace", defaultNamespace, "modelName", modelName)
	return defaultNamespace
}

// resolveParameterValue resolves a parameter value from either direct value or ValueFrom reference
func (r *EvaluationReconciler) resolveParameterValue(ctx context.Context, param *arkv1alpha1.Parameter, namespace string) string {
	log := logf.FromContext(ctx)

	if param.Value != "" {
		return param.Value
	}

	if param.ValueFrom != nil {
		resolver := r.getResolver()
		valueSource := arkv1alpha1.ValueSource{
			ValueFrom: param.ValueFrom,
		}
		resolvedValue, err := resolver.ResolveValueSource(ctx, valueSource, namespace)
		if err != nil {
			log.Error(err, "Failed to resolve parameter", "parameter", param.Name)
			return ""
		}
		return resolvedValue
	}

	return ""
}

// getModelNameFromParameters extracts the model name from parameters
func (r *EvaluationReconciler) getModelNameFromParameters(modelNameParam *arkv1alpha1.Parameter, paramMap map[string]string) string {
	if modelNameParam == nil {
		return ""
	}

	if modelNameParam.Value != "" {
		return modelNameParam.Value
	}

	// Model name from valueFrom is already resolved in paramMap
	return paramMap[paramModelName]
}

// modelExistsInNamespace checks if a model exists in the specified namespace
func (r *EvaluationReconciler) modelExistsInNamespace(ctx context.Context, modelName, namespace string) bool {
	var model arkv1alpha1.Model
	modelKey := client.ObjectKey{Name: modelName, Namespace: namespace}
	err := r.Get(ctx, modelKey, &model)
	return err == nil
}

// mergeParameters merges evaluator parameters with evaluation parameters, with evaluation parameters taking precedence
func (r *EvaluationReconciler) mergeParameters(evaluatorParams, evaluationParams []arkv1alpha1.Parameter) []arkv1alpha1.Parameter {
	// Create map of evaluation parameters for quick lookup
	evalParamMap := make(map[string]arkv1alpha1.Parameter)
	for _, param := range evaluationParams {
		evalParamMap[param.Name] = param
	}

	merged := make([]arkv1alpha1.Parameter, 0, len(evaluatorParams)+len(evaluationParams))

	// Start with evaluator parameters, overriding with evaluation params
	for _, evalParam := range evaluatorParams {
		if overrideParam, exists := evalParamMap[evalParam.Name]; exists {
			merged = append(merged, overrideParam) // Use evaluation parameter
			delete(evalParamMap, evalParam.Name)   // Mark as processed
		} else {
			merged = append(merged, evalParam) // Use evaluator parameter
		}
	}

	// Add remaining evaluation parameters that weren't overrides
	for _, param := range evalParamMap {
		merged = append(merged, param)
	}

	return merged
}

// resolveFinalParameters resolves and merges parameters from evaluator and evaluation
func (r *EvaluationReconciler) resolveFinalParameters(ctx context.Context, evaluation arkv1alpha1.Evaluation) []arkv1alpha1.Parameter {
	log := logf.FromContext(ctx)

	// Get evaluator to resolve its parameters
	evaluatorNamespace := evaluation.Spec.Evaluator.Namespace
	if evaluatorNamespace == "" {
		evaluatorNamespace = evaluation.Namespace
	}

	log.Info("Resolving evaluator parameters", "evaluation", evaluation.Name, "evaluatorName", evaluation.Spec.Evaluator.Name, "evaluatorNamespace", evaluatorNamespace)

	var evaluator arkv1alpha1.Evaluator
	evaluatorKey := client.ObjectKey{
		Name:      evaluation.Spec.Evaluator.Name,
		Namespace: evaluatorNamespace,
	}

	if err := r.Get(ctx, evaluatorKey, &evaluator); err != nil {
		log.Error(err, "Failed to get evaluator, falling back to evaluation parameters only", "evaluatorKey", evaluatorKey)
		return evaluation.Spec.Evaluator.Parameters // Fall back to evaluation parameters only
	}

	log.Info("Evaluator retrieved successfully", "evaluation", evaluation.Name, "evaluatorParamsCount", len(evaluator.Spec.Parameters), "evaluatorParams", evaluator.Spec.Parameters)

	// If evaluator has no parameters, just return evaluation parameters
	if len(evaluator.Spec.Parameters) == 0 {
		log.Info("Evaluator has no parameters, returning evaluation parameters", "evaluation", evaluation.Name, "evaluationParams", evaluation.Spec.Evaluator.Parameters)
		return evaluation.Spec.Evaluator.Parameters
	}

	// Resolve evaluator parameters (this would need to be implemented if we support parameter resolution in evaluators)
	// For now, we'll convert the evaluator parameters to the standard Parameter format
	evaluatorParams := make([]arkv1alpha1.Parameter, 0, len(evaluator.Spec.Parameters))
	for _, param := range evaluator.Spec.Parameters {
		evaluatorParams = append(evaluatorParams, arkv1alpha1.Parameter{
			Name:  param.Name,
			Value: param.Value, // For now, we only support direct values from evaluators
		})
	}

	log.Info("Converted evaluator parameters", "evaluation", evaluation.Name, "convertedParams", evaluatorParams)

	// Log specific model parameters for debugging
	for _, param := range evaluatorParams {
		if param.Name == paramModelName || param.Name == paramModelNamespace {
			log.Info("Found model parameter in evaluator", "evaluation", evaluation.Name, "paramName", param.Name, "paramValue", param.Value)
		}
	}

	// Merge evaluator parameters with evaluation parameters (evaluation takes precedence)
	merged := r.mergeParameters(evaluatorParams, evaluation.Spec.Evaluator.Parameters)
	log.Info("Merged parameters", "evaluation", evaluation.Name, "merged", merged)

	// Log specific model parameters after merging
	for _, param := range merged {
		if param.Name == paramModelName || param.Name == paramModelNamespace {
			log.Info("Found model parameter after merge", "evaluation", evaluation.Name, "paramName", param.Name, "paramValue", param.Value)
		}
	}

	return merged
}

func (r *EvaluationReconciler) processDirectEvaluation(ctx context.Context, evaluation arkv1alpha1.Evaluation) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Validate direct evaluation requirements
	if evaluation.Spec.Config.Input == "" {
		if err := r.updateStatus(ctx, evaluation, statusError, "Direct evaluation requires non-empty input"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	if evaluation.Spec.Config.Output == "" {
		if err := r.updateStatus(ctx, evaluation, statusError, "Direct evaluation requires non-empty output"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	log.Info("Direct evaluation validated, calling unified evaluator", "evaluation", evaluation.Name)

	// Resolve parameters with merging for manual evaluations
	finalParameters := r.resolveFinalParameters(ctx, evaluation)

	// Convert parameters to map for debugging
	paramMap := r.convertParametersToMap(ctx, finalParameters, evaluation.Namespace)
	log.Info("Parameters converted to map", "evaluation", evaluation.Name, "paramMap", paramMap, "finalParametersCount", len(finalParameters))

	// Build unified evaluation request
	request := genai.UnifiedEvaluationRequest{
		Type: evaluation.Spec.Type,
		Config: map[string]interface{}{
			"input":  evaluation.Spec.Config.Input,
			"output": evaluation.Spec.Config.Output,
		},
		Parameters:    paramMap,
		EvaluatorName: evaluation.Spec.Evaluator.Name,
	}

	log.Info("Built unified evaluation request", "evaluation", evaluation.Name, "request", request)

	// Call unified endpoint
	response, err := genai.CallUnifiedEvaluator(ctx, r.Client, evaluation.Spec.Evaluator, request, evaluation.Namespace)
	if err != nil {
		log.Error(err, "Failed to call unified evaluator", "evaluation", evaluation.Name)
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Evaluator call failed: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Complete evaluation with all results in one operation
	if err := r.updateEvaluationComplete(ctx, evaluation, response, "Direct evaluation completed successfully"); err != nil {
		return ctrl.Result{}, err
	}

	// Log the response metadata for debugging
	log.Info("Evaluation response received", "evaluation", evaluation.Name, "metadata", response.Metadata, "metadata_count", len(response.Metadata))

	log.Info("Direct evaluation completed with unified endpoint", "evaluation", evaluation.Name, "score", response.Score, "passed", response.Passed)
	return ctrl.Result{}, nil
}

func (r *EvaluationReconciler) processBatchEvaluation(ctx context.Context, evaluation arkv1alpha1.Evaluation) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Validate batch evaluation requirements
	if len(evaluation.Spec.Config.Evaluations) == 0 {
		if err := r.updateStatus(ctx, evaluation, statusError, "Batch evaluation requires at least one evaluation in config.evaluations"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Validate input/output for batch evaluation
	if evaluation.Spec.Config.Input == "" || evaluation.Spec.Config.Output == "" {
		if err := r.updateStatus(ctx, evaluation, statusError, "Batch evaluation requires both input and output"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	log.Info("Batch evaluation started", "evaluation", evaluation.Name, "evaluationCount", len(evaluation.Spec.Config.Evaluations))

	// Note: Batch status tracking would be implemented here for batch evaluations
	// Currently simplified for Phase 2 implementation

	// Create child evaluations if not already created
	childrenCreated, err := r.ensureChildEvaluations(ctx, evaluation)
	if err != nil {
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Failed to create child evaluations: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	if !childrenCreated {
		// Still creating children, requeue
		return ctrl.Result{RequeueAfter: time.Second * 5}, nil
	}

	// Check child evaluation status
	allCompleted, err := r.checkChildEvaluationStatus(ctx, evaluation)
	if err != nil {
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Failed to check child evaluations: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	if !allCompleted {
		// Still waiting for children to complete, requeue
		return ctrl.Result{RequeueAfter: time.Second * 10}, nil
	}

	// Aggregate results from child evaluations
	err = r.aggregateChildResults(ctx, evaluation)
	if err != nil {
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Failed to aggregate child results: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	log.Info("Batch evaluation completed", "evaluation", evaluation.Name)
	return ctrl.Result{}, nil
}

// fetchGoldenDataset is deprecated - GoldenDataset CRD has been removed
// Use ConfigMaps with golden examples instead
// func (r *EvaluationReconciler) fetchGoldenDataset(ctx context.Context, evaluation arkv1alpha1.Evaluation) (*arkv1alpha1.GoldenDataset, error) {
// 	return nil, fmt.Errorf("GoldenDataset support is deprecated - use ConfigMaps instead")
// }

func (r *EvaluationReconciler) fetchQuery(ctx context.Context, evaluation arkv1alpha1.Evaluation) (*arkv1alpha1.Query, error) {
	// Resolve query namespace
	queryNamespace := evaluation.Spec.Config.QueryRef.Namespace
	if queryNamespace == "" {
		queryNamespace = evaluation.Namespace
	}

	// Fetch Query
	var query arkv1alpha1.Query
	queryKey := client.ObjectKey{
		Name:      evaluation.Spec.Config.QueryRef.Name,
		Namespace: queryNamespace,
	}

	if err := r.Get(ctx, queryKey, &query); err != nil {
		if errors.IsNotFound(err) {
			return nil, fmt.Errorf("query '%s' not found in namespace '%s'", evaluation.Spec.Config.QueryRef.Name, queryNamespace)
		}
		return nil, fmt.Errorf("failed to fetch Query: %v", err)
	}

	// Validate query is complete
	if query.Status.Phase != "done" {
		return nil, fmt.Errorf("query '%s' is not complete (phase: %s)", query.Name, query.Status.Phase)
	}

	return &query, nil
}

// convertGoldenDatasetToTestCases is deprecated - GoldenDataset CRD has been removed
// func (r *EvaluationReconciler) convertGoldenDatasetToTestCases(dataset *arkv1alpha1.GoldenDataset, requestedTestCases []string) map[string]map[string]string {
// 	testCases := make(map[string]map[string]string)
// 	// Implementation removed - use ConfigMaps instead
// 	return testCases
// }

// evaluateDataset is deprecated - GoldenDataset CRD has been removed
// func (r *EvaluationReconciler) evaluateDataset(ctx context.Context, evaluation arkv1alpha1.Evaluation, dataset *arkv1alpha1.GoldenDataset) error {
// 	// Note: Dataset evaluation is deprecated in new CRD structure
// 	// This function is kept for backward compatibility but should not be used
// 	return fmt.Errorf("dataset evaluation is deprecated in the new evaluation structure")
// }

func (r *EvaluationReconciler) processQueryEvaluation(ctx context.Context, evaluation arkv1alpha1.Evaluation) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	// Validate query evaluation requirements
	if evaluation.Spec.Config.QueryBasedEvaluationConfig == nil || evaluation.Spec.Config.QueryRef == nil {
		if err := r.updateStatus(ctx, evaluation, statusError, "Query evaluation requires queryRef in config"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	log.Info("Query evaluation started", "evaluation", evaluation.Name, "query", evaluation.Spec.Config.QueryRef.Name)

	// Fetch and validate the referenced query
	query, err := r.fetchQuery(ctx, evaluation)
	if err != nil {
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Failed to fetch Query: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	log.Info("Query validated", "evaluation", evaluation.Name, "query", evaluation.Spec.Config.QueryRef.Name, "queryPhase", query.Status.Phase)

	// For query evaluation, we don't extract input/output locally
	// The evaluator service will resolve them from the query reference
	log.Info("Query validation complete, delegating input/output resolution to evaluator service", "evaluation", evaluation.Name, "query", evaluation.Spec.Config.QueryRef.Name)

	// Note: GoldenDataset support is deprecated in new CRD structure

	// Resolve parameters with merging for manual evaluations
	finalParameters := r.resolveFinalParameters(ctx, evaluation)

	// Build unified DirectRequest using extracted input/output
	// Note: Using DirectRequest since QueryRefRequest is not yet implemented in the service
	// Add query reference to parameters for evaluators that need full query metadata
	parameters := r.convertParametersToMap(ctx, finalParameters, evaluation.Namespace)

	// Ensure queryRef has proper namespace - default to evaluation's namespace if not specified
	queryRef := evaluation.Spec.Config.QueryRef
	log.Info("Original QueryRef", "evaluation", evaluation.Name, "queryRefNamespace", queryRef.Namespace, "evaluationNamespace", evaluation.Namespace)
	if queryRef.Namespace == "" {
		queryRefCopy := *queryRef
		queryRefCopy.Namespace = evaluation.Namespace
		queryRef = &queryRefCopy
		log.Info("QueryRef namespace was empty, using evaluation namespace", "evaluation", evaluation.Name, "namespace", evaluation.Namespace)
	} else {
		log.Info("QueryRef namespace already set", "evaluation", evaluation.Name, "queryRefNamespace", queryRef.Namespace)
	}

	if queryRef != nil {
		parameters["queryRef"] = fmt.Sprintf("%s/%s", queryRef.Namespace, queryRef.Name)
	}

	request := genai.UnifiedEvaluationRequest{
		Type: "query",
		Config: map[string]interface{}{
			"queryRef": queryRef,
		},
		Parameters:    parameters,
		EvaluatorName: evaluation.Spec.Evaluator.Name,
	}

	log.Info("CONTROLLER: Built request", "evaluation", evaluation.Name, "queryRefInConfig", queryRef, "queryRefName", queryRef.Name, "queryRefNamespace", queryRef.Namespace)

	// Call unified evaluator endpoint
	response, err := genai.CallUnifiedEvaluator(ctx, r.Client, evaluation.Spec.Evaluator, request, evaluation.Namespace)
	if err != nil {
		log.Error(err, "Failed to call unified direct evaluator for query evaluation", "evaluation", evaluation.Name)
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Query evaluation failed: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Update evaluation status with actual results
	if err := r.updateEvaluationResults(ctx, evaluation, response); err != nil {
		return ctrl.Result{}, err
	}

	// Log the response metadata for debugging
	log.Info("Evaluation response received", "evaluation", evaluation.Name, "metadata", response.Metadata, "metadata_count", len(response.Metadata))

	// Complete evaluation with all results including metadata annotations
	if err := r.updateEvaluationComplete(ctx, evaluation, response, "Query evaluation completed successfully"); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("Query evaluation completed with unified endpoint", "evaluation", evaluation.Name, "score", response.Score, "passed", response.Passed)
	return ctrl.Result{}, nil
}

func (r *EvaluationReconciler) updateStatus(ctx context.Context, evaluation arkv1alpha1.Evaluation, phase, message string) error {
	log := logf.FromContext(ctx)

	// Fetch the latest version to avoid resource conflicts
	latest := &arkv1alpha1.Evaluation{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      evaluation.Name,
		Namespace: evaluation.Namespace,
	}, latest); err != nil {
		log.Error(err, "failed to get latest Evaluation for status update", "evaluation", evaluation.Name)
		return err
	}

	latest.Status.Phase = phase
	latest.Status.Message = message

	if err := r.Status().Update(ctx, latest); err != nil {
		log.Error(err, "failed to update Evaluation status", "evaluation", evaluation.Name)
		return err
	}

	log.Info("Updated Evaluation status", "evaluation", evaluation.Name, "phase", phase, "message", message)
	return nil
}

func (r *EvaluationReconciler) updateEvaluationResults(ctx context.Context, evaluation arkv1alpha1.Evaluation, response *genai.EvaluationResponse) error {
	log := logf.FromContext(ctx)

	// Fetch the latest version to avoid resource conflicts
	latest := &arkv1alpha1.Evaluation{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      evaluation.Name,
		Namespace: evaluation.Namespace,
	}, latest); err != nil {
		log.Error(err, "failed to get latest Evaluation for results update", "evaluation", evaluation.Name)
		return err
	}

	// Update results
	latest.Status.Score = response.Score
	latest.Status.Passed = response.Passed
	latest.Status.TokenUsage = response.TokenUsage

	if err := r.Status().Update(ctx, latest); err != nil {
		log.Error(err, "failed to update Evaluation results", "evaluation", evaluation.Name)
		return err
	}

	log.Info("Updated Evaluation results", "evaluation", evaluation.Name, "score", response.Score, "passed", response.Passed)
	return nil
}

func (r *EvaluationReconciler) updateEvaluationComplete(ctx context.Context, evaluation arkv1alpha1.Evaluation, response *genai.EvaluationResponse, message string) error {
	log := logf.FromContext(ctx)

	// Fetch the latest version to avoid resource conflicts
	latest := &arkv1alpha1.Evaluation{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      evaluation.Name,
		Namespace: evaluation.Namespace,
	}, latest); err != nil {
		log.Error(err, "failed to get latest Evaluation for completion update", "evaluation", evaluation.Name)
		return err
	}

	// First, update annotations if present
	if len(response.Metadata) > 0 {
		if latest.Annotations == nil {
			latest.Annotations = make(map[string]string)
		}
		for key, value := range response.Metadata {
			annotationKey := fmt.Sprintf("evaluation.metadata/%s", key)
			latest.Annotations[annotationKey] = value
			log.Info("Adding metadata as annotation", "evaluation", evaluation.Name, "key", annotationKey, "value", value)
		}

		// Update annotations first
		if err := r.Update(ctx, latest); err != nil {
			log.Error(err, "failed to update Evaluation annotations", "evaluation", evaluation.Name)
			return err
		}

		// Get latest version after annotation update for status update
		if err := r.Get(ctx, client.ObjectKey{Name: evaluation.Name, Namespace: evaluation.Namespace}, latest); err != nil {
			log.Error(err, "failed to get latest for status update", "evaluation", evaluation.Name)
			return err
		}
	}

	// Update status
	latest.Status.Score = response.Score
	latest.Status.Passed = response.Passed
	latest.Status.TokenUsage = response.TokenUsage
	latest.Status.Phase = statusDone
	latest.Status.Message = message

	// Update status
	if err := r.Status().Update(ctx, latest); err != nil {
		log.Error(err, "failed to complete Evaluation status", "evaluation", evaluation.Name)
		return err
	}

	log.Info("Completed Evaluation", "evaluation", evaluation.Name, "score", response.Score, "passed", response.Passed, "phase", statusDone)
	return nil
}

func (r *EvaluationReconciler) ensureChildEvaluations(ctx context.Context, parentEvaluation arkv1alpha1.Evaluation) (bool, error) {
	log := logf.FromContext(ctx)

	// Check if child evaluations already exist
	existingChildren := make(map[string]bool)
	var childEvaluations arkv1alpha1.EvaluationList
	if err := r.List(ctx, &childEvaluations, client.InNamespace(parentEvaluation.Namespace), client.MatchingLabels{
		"parent-evaluation": parentEvaluation.Name,
	}); err != nil {
		return false, fmt.Errorf("failed to list child evaluations: %w", err)
	}

	for _, child := range childEvaluations.Items {
		existingChildren[child.Name] = true
	}

	// Create missing child evaluations from batch config
	for i, evaluationRef := range parentEvaluation.Spec.Config.Evaluations {
		childName := fmt.Sprintf("%s-child-%d", parentEvaluation.Name, i)

		if existingChildren[childName] {
			continue // Child already exists
		}

		// Note: This is a simplified implementation - in a full implementation,
		// we would fetch the referenced evaluation and copy its spec
		childEvaluation := &arkv1alpha1.Evaluation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      childName,
				Namespace: parentEvaluation.Namespace,
				Labels: map[string]string{
					"parent-evaluation": parentEvaluation.Name,
					"child-index":       strconv.Itoa(i),
				},
				OwnerReferences: []metav1.OwnerReference{
					{
						APIVersion: parentEvaluation.APIVersion,
						Kind:       parentEvaluation.Kind,
						Name:       parentEvaluation.Name,
						UID:        parentEvaluation.UID,
						Controller: &[]bool{true}[0],
					},
				},
			},
			Spec: arkv1alpha1.EvaluationSpec{
				Type: "direct",
				Config: arkv1alpha1.EvaluationConfig{
					DirectEvaluationConfig: &arkv1alpha1.DirectEvaluationConfig{
						Input:  "placeholder", // Would be populated from referenced evaluation
						Output: "placeholder", // Would be populated from referenced evaluation
					},
				},
				Evaluator: parentEvaluation.Spec.Evaluator, // Use parent's evaluator
			},
		}

		if err := r.Create(ctx, childEvaluation); err != nil {
			log.Error(err, "Failed to create child evaluation", "childName", childName)
			return false, fmt.Errorf("failed to create child evaluation %s: %w", childName, err)
		}

		log.Info("Created child evaluation", "childName", childName, "evaluationRef", evaluationRef.Name)
	}

	return len(existingChildren) == len(parentEvaluation.Spec.Config.Evaluations), nil
}

func (r *EvaluationReconciler) checkChildEvaluationStatus(ctx context.Context, parentEvaluation arkv1alpha1.Evaluation) (bool, error) {
	log := logf.FromContext(ctx)

	var childEvaluations arkv1alpha1.EvaluationList
	if err := r.List(ctx, &childEvaluations, client.InNamespace(parentEvaluation.Namespace), client.MatchingLabels{
		"parent-evaluation": parentEvaluation.Name,
	}); err != nil {
		return false, fmt.Errorf("failed to list child evaluations: %w", err)
	}

	completedCount := 0
	for _, child := range childEvaluations.Items {
		if child.Status.Phase == statusDone || child.Status.Phase == statusError {
			completedCount++
		}
	}

	// Update parent status to reflect child progress
	if err := r.Status().Update(ctx, &parentEvaluation); err != nil {
		log.Error(err, "Failed to update parent evaluation status", "evaluation", parentEvaluation.Name)
		return false, err
	}

	allCompleted := completedCount == len(childEvaluations.Items)
	log.Info("Child evaluation status check", "parent", parentEvaluation.Name, "completed", completedCount, "total", len(childEvaluations.Items), "allCompleted", allCompleted)

	return allCompleted, nil
}

func (r *EvaluationReconciler) aggregateChildResults(ctx context.Context, parentEvaluation arkv1alpha1.Evaluation) error {
	log := logf.FromContext(ctx)

	var childEvaluations arkv1alpha1.EvaluationList
	if err := r.List(ctx, &childEvaluations, client.InNamespace(parentEvaluation.Namespace), client.MatchingLabels{
		"parent-evaluation": parentEvaluation.Name,
	}); err != nil {
		return fmt.Errorf("failed to list child evaluations: %w", err)
	}

	// Initialize batch results tracking
	totalTests := len(childEvaluations.Items)
	passedTests := 0
	failedTests := 0

	totalScore := 0.0
	validScores := 0

	// Initialize token usage aggregation
	aggregatedTokenUsage := arkv1alpha1.TokenUsage{
		PromptTokens:     0,
		CompletionTokens: 0,
		TotalTokens:      0,
	}

	// Aggregate results from all children
	for _, child := range childEvaluations.Items {
		// Count passed/failed
		if child.Status.Passed {
			passedTests++
		} else {
			failedTests++
		}

		// Aggregate scores
		if child.Status.Score != "" {
			if score, err := strconv.ParseFloat(child.Status.Score, 64); err == nil {
				totalScore += score
				validScores++
			}
		}

		// Aggregate token usage
		if child.Status.TokenUsage != nil {
			aggregatedTokenUsage.PromptTokens += child.Status.TokenUsage.PromptTokens
			aggregatedTokenUsage.CompletionTokens += child.Status.TokenUsage.CompletionTokens
			aggregatedTokenUsage.TotalTokens += child.Status.TokenUsage.TotalTokens
		}
	}

	// Calculate average score
	averageScore := "0.000"
	if validScores > 0 {
		avgScore := totalScore / float64(validScores)
		averageScore = fmt.Sprintf("%.3f", avgScore)
	}

	// Determine parent pass/fail status
	// Parent passes only if ALL children pass
	parentPassed := passedTests == totalTests

	// Update parent evaluation status
	parentEvaluation.Status.Score = averageScore
	parentEvaluation.Status.Passed = parentPassed
	parentEvaluation.Status.Phase = statusDone
	parentEvaluation.Status.Message = fmt.Sprintf("Batch evaluation completed: %d/%d children passed",
		passedTests, totalTests)
	parentEvaluation.Status.TokenUsage = &aggregatedTokenUsage

	if err := r.Status().Update(ctx, &parentEvaluation); err != nil {
		log.Error(err, "Failed to update parent evaluation with batch results", "evaluation", parentEvaluation.Name)
		return err
	}

	log.Info("Aggregated batch results", "parent", parentEvaluation.Name,
		"totalChildren", totalTests,
		"passedChildren", passedTests,
		"averageScore", averageScore,
		"parentPassed", parentPassed)

	return nil
}

func (r *EvaluationReconciler) processBaselineEvaluation(ctx context.Context, evaluation arkv1alpha1.Evaluation) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Baseline evaluation started", "evaluation", evaluation.Name)

	// Resolve parameters with merging for baseline evaluations (same as direct evaluation)
	finalParameters := r.resolveFinalParameters(ctx, evaluation)

	// Convert parameters to map for debugging
	paramMap := r.convertParametersToMap(ctx, finalParameters, evaluation.Namespace)
	log.Info("Built parameters for baseline evaluation", "evaluation", evaluation.Name, "parameters", paramMap)

	// Build unified evaluation request for baseline evaluation
	request := genai.UnifiedEvaluationRequest{
		Type:          "baseline",
		Config:        map[string]interface{}{}, // Baseline has empty config
		Parameters:    paramMap,
		EvaluatorName: evaluation.Spec.Evaluator.Name,
	}

	log.Info("Built unified evaluation request for baseline", "evaluation", evaluation.Name)

	// Call unified evaluator endpoint
	response, err := genai.CallUnifiedEvaluator(ctx, r.Client, evaluation.Spec.Evaluator, request, evaluation.Namespace)
	if err != nil {
		log.Error(err, "Failed to call unified evaluator for baseline evaluation", "evaluation", evaluation.Name)
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Baseline evaluation failed: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Update evaluation status with actual results
	if err := r.updateEvaluationResults(ctx, evaluation, response); err != nil {
		return ctrl.Result{}, err
	}

	// Complete evaluation with all results including metadata annotations
	if err := r.updateEvaluationComplete(ctx, evaluation, response, "Baseline evaluation completed successfully"); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("Baseline evaluation completed", "evaluation", evaluation.Name, "score", evaluation.Status.Score, "passed", evaluation.Status.Passed)
	return ctrl.Result{}, nil
}

func (r *EvaluationReconciler) processEventEvaluation(ctx context.Context, evaluation arkv1alpha1.Evaluation) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Event evaluation started", "evaluation", evaluation.Name)

	// Validate event evaluation requirements
	if len(evaluation.Spec.Config.Rules) == 0 {
		if err := r.updateStatus(ctx, evaluation, statusError, "Event evaluation requires rules in config"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Build the unified evaluation request for event type
	config := make(map[string]interface{})

	// Add rules to config
	rules := make([]map[string]interface{}, 0, len(evaluation.Spec.Config.Rules))
	for _, rule := range evaluation.Spec.Config.Rules {
		ruleMap := map[string]interface{}{
			"name":        rule.Name,
			"expression":  rule.Expression,
			"description": rule.Description,
			"weight":      rule.Weight,
		}
		rules = append(rules, ruleMap)
	}
	config["rules"] = rules

	// Resolve parameters
	finalParams := r.resolveFinalParameters(ctx, evaluation)

	// Convert parameters to map
	paramMap := make(map[string]string)
	for _, param := range finalParams {
		paramMap[param.Name] = param.Value
	}

	// Add query context parameters if not already present
	if _, exists := paramMap["query.name"]; !exists && evaluation.Spec.Config.QueryRef != nil {
		paramMap["query.name"] = evaluation.Spec.Config.QueryRef.Name
	}
	if _, exists := paramMap["query.namespace"]; !exists {
		queryNamespace := evaluation.Namespace
		if evaluation.Spec.Config.QueryRef != nil && evaluation.Spec.Config.QueryRef.Namespace != "" {
			queryNamespace = evaluation.Spec.Config.QueryRef.Namespace
		}
		paramMap["query.namespace"] = queryNamespace
	}

	// Build unified request
	unifiedRequest := genai.UnifiedEvaluationRequest{
		Type:          "event",
		Config:        config,
		Parameters:    paramMap,
		EvaluatorName: evaluation.Spec.Evaluator.Name,
	}

	log.Info("Calling unified evaluator for event evaluation",
		"evaluator", evaluation.Spec.Evaluator.Name,
		"ruleCount", len(evaluation.Spec.Config.Rules),
		"parameters", paramMap)

	// Call the evaluator service
	response, err := genai.CallUnifiedEvaluator(ctx, r.Client, evaluation.Spec.Evaluator, unifiedRequest, evaluation.Namespace)
	if err != nil {
		log.Error(err, "Failed to call evaluator for event evaluation")
		if err := r.updateStatus(ctx, evaluation, statusError, fmt.Sprintf("Evaluation failed: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Update evaluation status with response
	if err := r.updateEvaluationResults(ctx, evaluation, response); err != nil {
		return ctrl.Result{}, err
	}

	// Prepare status message
	statusMessage := fmt.Sprintf("Event evaluation completed with %d rules", len(evaluation.Spec.Config.Rules))
	if response.Passed {
		statusMessage = fmt.Sprintf("%s - passed (score: %s)", statusMessage, response.Score)
	} else {
		statusMessage = fmt.Sprintf("%s - failed (score: %s)", statusMessage, response.Score)
	}

	// Complete evaluation with all results including metadata annotations
	if err := r.updateEvaluationComplete(ctx, evaluation, response, statusMessage); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("Event evaluation completed",
		"evaluation", evaluation.Name,
		"score", response.Score,
		"passed", response.Passed,
		"metadataCount", len(response.Metadata))

	return ctrl.Result{}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *EvaluationReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Evaluation{}).
		Owns(&arkv1alpha1.Evaluation{}). // Watch child evaluations
		Named("evaluation").
		Complete(r)
}
