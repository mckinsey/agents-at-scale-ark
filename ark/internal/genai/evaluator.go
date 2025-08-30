/* Copyright 2025. McKinsey & Company */

package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

type EvaluationRequest struct {
	QueryID   string                 `json:"queryId"`
	Input     string                 `json:"input"`
	Responses []arkv1alpha1.Response `json:"responses"`
	Query     arkv1alpha1.Query      `json:"query"`
}

// GoldenExample represents a single golden dataset example
type GoldenExample struct {
	Input          string            `json:"input"`
	ExpectedOutput string            `json:"expectedOutput"`
	Metadata       map[string]string `json:"metadata,omitempty"`
}

type EvaluationResponse struct {
	Score      string                  `json:"score,omitempty"`
	Passed     bool                    `json:"passed,omitempty"`
	Metadata   map[string]string       `json:"metadata,omitempty"`
	Error      string                  `json:"error,omitempty"`
	TokenUsage *arkv1alpha1.TokenUsage `json:"tokenUsage,omitempty"`
}

// Deprecated types - use UnifiedEvaluationRequest instead

// UnifiedEvaluationRequest for the new unified evaluation endpoint
type UnifiedEvaluationRequest struct {
	Type          string                 `json:"type"`
	Config        map[string]interface{} `json:"config"`
	Parameters    map[string]string      `json:"parameters,omitempty"`
	EvaluatorName string                 `json:"evaluatorName,omitempty"`
}

type DatasetEvaluationResponse struct {
	EvaluationID    string                    `json:"evaluationId"`
	TotalTestCases  int                       `json:"totalTestCases"`
	PassedTestCases int                       `json:"passedTestCases"`
	FailedTestCases int                       `json:"failedTestCases"`
	AverageScore    string                    `json:"averageScore"`
	TestCaseResults map[string]map[string]any `json:"testCaseResults"`
	Error           string                    `json:"error,omitempty"`
}

func CallSingleEvaluator(ctx context.Context, k8sClient client.Client, query arkv1alpha1.Query, evaluatorRef arkv1alpha1.EvaluatorRef, recorder EventEmitter) (*arkv1alpha1.EvaluationResult, error) {
	tracker := NewOperationTracker(recorder, ctx, "Evaluation", query.Name, map[string]string{
		"namespace": query.Namespace,
		"evaluator": evaluatorRef.Name,
	})

	evaluator, err := loadEvaluator(ctx, k8sClient, evaluatorRef, query.Namespace)
	if err != nil {
		tracker.Fail(err)
		return nil, err
	}

	address, err := resolveEvaluatorAddress(ctx, k8sClient, evaluator)
	if err != nil {
		tracker.Fail(err)
		return nil, err
	}

	// For backward compatibility with query evaluation - evaluation CRDs don't use this path
	request := buildEvaluationRequest(query)
	response, err := callEvaluatorHTTP(ctx, address, request)
	if err != nil {
		tracker.Fail(err)
		return nil, err
	}

	result := &arkv1alpha1.EvaluationResult{
		Score:    response.Score,
		Passed:   response.Passed,
		Metadata: response.Metadata,
	}

	tracker.Complete(fmt.Sprintf("score: %s, passed: %t", response.Score, response.Passed))
	return result, nil
}

func CallEvaluators(ctx context.Context, k8sClient client.Client, query arkv1alpha1.Query, evaluatorRefs []arkv1alpha1.EvaluatorRef, recorder EventEmitter) ([]arkv1alpha1.EvaluationResult, error) {
	if len(evaluatorRefs) == 0 {
		return nil, nil
	}

	results := make([]arkv1alpha1.EvaluationResult, len(evaluatorRefs))
	var wg sync.WaitGroup

	for i, evaluatorRef := range evaluatorRefs {
		wg.Add(1)
		go func(idx int, evalRef arkv1alpha1.EvaluatorRef) {
			defer wg.Done()
			results[idx] = callEvaluatorWithErrorHandling(ctx, k8sClient, query, evalRef, recorder)
		}(i, evaluatorRef)
	}

	wg.Wait()
	return results, nil
}

func loadEvaluator(ctx context.Context, k8sClient client.Client, evaluatorRef arkv1alpha1.EvaluatorRef, defaultNamespace string) (*arkv1alpha1.Evaluator, error) {
	namespace := evaluatorRef.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	var evaluator arkv1alpha1.Evaluator
	key := types.NamespacedName{Name: evaluatorRef.Name, Namespace: namespace}

	if err := k8sClient.Get(ctx, key, &evaluator); err != nil {
		return nil, fmt.Errorf("failed to get evaluator %s: %w", evaluatorRef.Name, err)
	}

	return &evaluator, nil
}

func loadEvaluatorByName(ctx context.Context, k8sClient client.Client, name, namespace, defaultNamespace string) (*arkv1alpha1.Evaluator, error) {
	evalNamespace := namespace
	if evalNamespace == "" {
		evalNamespace = defaultNamespace
	}

	var evaluator arkv1alpha1.Evaluator
	key := types.NamespacedName{Name: name, Namespace: evalNamespace}

	if err := k8sClient.Get(ctx, key, &evaluator); err != nil {
		return nil, fmt.Errorf("failed to get evaluator %s: %w", name, err)
	}

	return &evaluator, nil
}

func resolveEvaluatorAddress(ctx context.Context, k8sClient client.Client, evaluator *arkv1alpha1.Evaluator) (string, error) {
	resolver := common.NewValueSourceResolver(k8sClient)
	address, err := resolver.ResolveValueSource(ctx, evaluator.Spec.Address, evaluator.Namespace)
	if err != nil {
		return "", fmt.Errorf("failed to resolve evaluator address: %w", err)
	}
	return address, nil
}

func buildEvaluationRequest(query arkv1alpha1.Query) EvaluationRequest {
	return EvaluationRequest{
		QueryID:   string(query.UID),
		Input:     query.Spec.Input,
		Responses: query.Status.Responses,
		Query:     query,
	}
}

func callEvaluatorHTTPEndpoint(ctx context.Context, address, endpoint string, request any, timeout time.Duration) (*http.Response, error) {
	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpClient := &http.Client{Timeout: timeout}

	// Build endpoint URL
	evaluateURL := address
	if endpoint != "" {
		if evaluateURL[len(evaluateURL)-1] != '/' {
			evaluateURL += "/"
		}
		evaluateURL += endpoint
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, evaluateURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call evaluator: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("evaluator returned status %d", resp.StatusCode)
	}

	return resp, nil
}

func callEvaluatorHTTP(ctx context.Context, address string, request EvaluationRequest) (*EvaluationResponse, error) {
	resp, err := callEvaluatorHTTPEndpoint(ctx, address, "", request, 30*time.Second)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.Log.Error(closeErr, "failed to close response body")
		}
	}()

	var response EvaluationResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode evaluation response: %w", err)
	}

	if response.Error != "" {
		return nil, fmt.Errorf("evaluator returned error: %s", response.Error)
	}

	return &response, nil
}

// CallUnifiedEvaluator performs evaluation using the new unified endpoint
func CallUnifiedEvaluator(ctx context.Context, k8sClient client.Client, evaluatorRef arkv1alpha1.EvaluationEvaluatorRef, request UnifiedEvaluationRequest, namespace string) (*EvaluationResponse, error) {
	log := logf.FromContext(ctx)
	log.Info("CallUnifiedEvaluator started", "evaluatorRef", evaluatorRef.Name, "namespace", namespace, "parameters", request.Parameters)

	// Load evaluator
	evaluator, err := loadEvaluatorByName(ctx, k8sClient, evaluatorRef.Name, evaluatorRef.Namespace, namespace)
	if err != nil {
		log.Error(err, "Failed to load evaluator", "evaluatorRef", evaluatorRef.Name)
		return nil, err
	}

	log.Info("Evaluator loaded successfully", "evaluatorName", evaluator.Name, "evaluatorNamespace", evaluator.Namespace)

	// Resolve evaluator address
	address, err := resolveEvaluatorAddress(ctx, k8sClient, evaluator)
	if err != nil {
		log.Error(err, "Failed to resolve evaluator address")
		return nil, err
	}

	log.Info("Calling unified evaluator HTTP endpoint", "address", address, "requestType", request.Type, "parameters", request.Parameters)

	// Call unified evaluator HTTP endpoint
	response, err := callUnifiedEvaluatorHTTP(ctx, address, request)
	if err != nil {
		log.Error(err, "Unified evaluator HTTP call failed")
		return nil, err
	}

	log.Info("Unified evaluator call completed successfully", "response", response)
	return response, nil
}

func callUnifiedEvaluatorHTTP(ctx context.Context, address string, request UnifiedEvaluationRequest) (*EvaluationResponse, error) {
	// Use longer timeout for baseline evaluations due to multiple LLM calls
	timeout := 30 * time.Second
	if request.Type == "baseline" {
		timeout = 120 * time.Second // 2 minutes for baseline evaluations with multiple examples
	}

	resp, err := callEvaluatorHTTPEndpoint(ctx, address, "", request, timeout)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			logf.Log.Error(closeErr, "failed to close response body")
		}
	}()

	var response EvaluationResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode unified evaluation response: %w", err)
	}

	if response.Error != "" {
		return nil, fmt.Errorf("unified evaluator returned error: %s", response.Error)
	}

	logf.Log.Info("Unified evaluator response", "score", response.Score, "passed", response.Passed, "metadata", response.Metadata, "metadata_count", len(response.Metadata))

	return &response, nil
}

func callEvaluatorWithErrorHandling(ctx context.Context, k8sClient client.Client, query arkv1alpha1.Query, evaluatorRef arkv1alpha1.EvaluatorRef, recorder EventEmitter) arkv1alpha1.EvaluationResult {
	result, err := CallSingleEvaluator(ctx, k8sClient, query, evaluatorRef, recorder)
	if err != nil {
		return arkv1alpha1.EvaluationResult{
			EvaluatorName: evaluatorRef.Name,
			Score:         "0",
			Passed:        false,
			Metadata:      map[string]string{"error": err.Error()},
		}
	}

	if result != nil {
		result.EvaluatorName = evaluatorRef.Name
		return *result
	}

	return arkv1alpha1.EvaluationResult{
		EvaluatorName: evaluatorRef.Name,
		Score:         "0",
		Passed:        false,
		Metadata:      map[string]string{"error": "no result returned"},
	}
}
