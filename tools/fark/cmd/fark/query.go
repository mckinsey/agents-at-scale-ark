package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func parseEvaluatorSelector(selectorStrings []string) (*metav1.LabelSelector, error) {
	if len(selectorStrings) == 0 {
		return nil, nil
	}

	matchLabels := make(map[string]string)
	for _, selector := range selectorStrings {
		parts := strings.SplitN(selector, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid evaluator selector format: %s (expected key=value)", selector)
		}
		matchLabels[parts[0]] = parts[1]
	}

	return &metav1.LabelSelector{
		MatchLabels: matchLabels,
	}, nil
}

func createQuery(input string, targets []arkv1alpha1.QueryTarget, namespace string, params []arkv1alpha1.Parameter, sessionId string, evaluators []string, evaluatorSelectorStrings []string) (*arkv1alpha1.Query, error) {
	queryName := fmt.Sprintf("query-%d", time.Now().Unix())

	spec := &arkv1alpha1.QuerySpec{
		Input:      input,
		Targets:    targets,
		Parameters: params,
		SessionId:  sessionId,
	}

	queryObjectMeta := &metav1.ObjectMeta{
		Name:      queryName,
		Namespace: namespace,
	}

	return getQuery(evaluators, evaluatorSelectorStrings, spec, queryObjectMeta)
}

func submitQuery(config *Config, query *arkv1alpha1.Query) error {
	unstructuredQuery, err := convertToUnstructured(query)
	if err != nil {
		return fmt.Errorf("failed to convert query: %v", err)
	}

	_, err = config.DynamicClient.Resource(GetGVR(ResourceQuery)).Namespace(query.Namespace).Create(
		context.TODO(),
		unstructuredQuery,
		metav1.CreateOptions{},
	)
	return err
}

func convertToUnstructured(query *arkv1alpha1.Query) (*unstructured.Unstructured, error) {
	unstructuredQuery, err := runtime.DefaultUnstructuredConverter.ToUnstructured(query)
	if err != nil {
		return nil, err
	}

	unstructuredObj := &unstructured.Unstructured{}
	unstructuredObj.SetUnstructuredContent(unstructuredQuery)

	return unstructuredObj, nil
}

func runListResourcesCommand(config *Config, resourceType ResourceType, namespace string, jsonOutput bool) error {
	rm := NewResourceManager(config)
	resources, err := rm.ListResources(resourceType, namespace)
	if err != nil {
		return fmt.Errorf("failed to list %s: %v", resourceType, err)
	}

	if jsonOutput {
		jsonData, err := json.MarshalIndent(resources, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %v", err)
		}
		fmt.Println(string(jsonData))
		return nil
	}

	for _, resource := range resources {
		if name, ok := getResourceName(resource); ok {
			fmt.Println(name)
		}
	}
	return nil
}

func getResourceName(resource map[string]any) (string, bool) {
	if metadata, ok := resource["metadata"].(map[string]any); ok {
		if name, ok := metadata["name"].(string); ok {
			return name, true
		}
	}
	return "", false
}

func deleteQuery(config *Config, queryName, namespace string) error {
	return config.DynamicClient.Resource(GetGVR(ResourceQuery)).Namespace(namespace).Delete(
		context.TODO(),
		queryName,
		metav1.DeleteOptions{},
	)
}

func getExistingQuery(config *Config, queryName, namespace string) (*arkv1alpha1.Query, error) {
	unstructuredQuery, err := config.DynamicClient.Resource(GetGVR(ResourceQuery)).Namespace(namespace).Get(
		context.TODO(),
		queryName,
		metav1.GetOptions{},
	)
	if err != nil {
		return nil, err
	}

	var query arkv1alpha1.Query
	err = runtime.DefaultUnstructuredConverter.FromUnstructured(
		unstructuredQuery.UnstructuredContent(),
		&query,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to convert to Query object: %v", err)
	}

	// Log token usage if available
	logTokenUsage(config.Logger, &query, "")

	return &query, nil
}

func getSessionId(provided, existing string) string {
	if provided != "" {
		return provided
	}
	return existing
}

func createTriggerQuery(existingQuery *arkv1alpha1.Query, input string, params []arkv1alpha1.Parameter, sessionId string, evaluators []string, evaluatorSelectorStrings []string) (*arkv1alpha1.Query, error) {
	queryName := fmt.Sprintf("trigger-%d", time.Now().Unix())

	spec := &arkv1alpha1.QuerySpec{
		Input:             input,
		Targets:           existingQuery.Spec.Targets,
		Selector:          existingQuery.Spec.Selector,
		Parameters:        params,
		Memory:            existingQuery.Spec.Memory,
		ServiceAccount:    existingQuery.Spec.ServiceAccount,
		SessionId:         getSessionId(sessionId, existingQuery.Spec.SessionId),
		Evaluators:        existingQuery.Spec.Evaluators,
		EvaluatorSelector: existingQuery.Spec.EvaluatorSelector,
	}

	queryObjectMeta := &metav1.ObjectMeta{
		Name:      queryName,
		Namespace: existingQuery.Namespace,
		Labels: map[string]string{
			annotations.TriggeredFrom: existingQuery.Name,
		},
	}

	return getQuery(evaluators, evaluatorSelectorStrings, spec, queryObjectMeta)
}

func getQuery(evaluators []string, evaluatorSelectorStrings []string, spec *arkv1alpha1.QuerySpec, objectMeta *metav1.ObjectMeta) (*arkv1alpha1.Query, error) {
	if len(evaluators) > 0 {
		evaluatorRefs := make([]arkv1alpha1.EvaluatorRef, len(evaluators))
		for i, evaluator := range evaluators {
			evaluatorRefs[i] = arkv1alpha1.EvaluatorRef{
				Name: evaluator,
			}
		}
		spec.Evaluators = evaluatorRefs
	}

	if len(evaluatorSelectorStrings) > 0 {
		evaluatorSelector, err := parseEvaluatorSelector(evaluatorSelectorStrings)
		if err != nil {
			return nil, err
		}
		spec.EvaluatorSelector = evaluatorSelector
	}

	return &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: *objectMeta,
		Spec:       *spec,
	}, nil
}
