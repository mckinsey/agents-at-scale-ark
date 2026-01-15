package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func createQuery(input string, target *arkv1alpha1.QueryTarget, namespace string, params []arkv1alpha1.Parameter, sessionId string, conversationId string, timeout *time.Duration) (*arkv1alpha1.Query, error) {
	queryName := fmt.Sprintf("cli-query-%d", time.Now().Unix())

	spec := &arkv1alpha1.QuerySpec{
		Input:          runtime.RawExtension{Raw: []byte(input)},
		Target:         target,
		Parameters:     params,
		SessionId:      sessionId,
		ConversationId: conversationId,
	}

	// Set timeout if provided
	if timeout != nil {
		spec.Timeout = &metav1.Duration{Duration: *timeout}
	}

	// Set TTL to 720 hours (30 days) to keep query resource around like other queries
	spec.TTL = &metav1.Duration{Duration: 720 * time.Hour}

	queryObjectMeta := &metav1.ObjectMeta{
		Name:       queryName,
		Namespace:  namespace,
		Finalizers: []string{"ark.mckinsey.com/finalizer"},
		Annotations: map[string]string{
			"ark.mckinsey.com/fark-created": "true",
		},
	}

	return &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: *queryObjectMeta,
		Spec:       *spec,
	}, nil
}

func submitQuery(config *Config, query *arkv1alpha1.Query) error {
	unstructuredQuery, err := convertToUnstructured(query)
	if err != nil {
		return fmt.Errorf("failed to convert query: %v", err)
	}

	// Create the query with finalizer and annotation already set
	_, err = config.DynamicClient.Resource(GetGVR(ResourceQuery)).Namespace(query.Namespace).Create(
		context.TODO(),
		unstructuredQuery,
		metav1.CreateOptions{},
	)
	return err
}

func convertToUnstructured(query *arkv1alpha1.Query) (*unstructured.Unstructured, error) {
	// Create a copy of the query without the RawExtension field to avoid conversion issues
	queryCopy := query.DeepCopy()
	originalInput := queryCopy.Spec.Input
	queryCopy.Spec.Input = runtime.RawExtension{} // Clear the RawExtension field temporarily

	// Convert the query without RawExtension. DefaultUnstructuredConverter cannot handle RawExtension
	unstructuredQuery, err := runtime.DefaultUnstructuredConverter.ToUnstructured(queryCopy)
	if err != nil {
		return nil, err
	}

	// Manually set the Input field as raw JSON in the unstructured map
	if originalInput.Raw != nil {
		var inputValue interface{}
		if err := json.Unmarshal(originalInput.Raw, &inputValue); err != nil {
			inputValue = string(originalInput.Raw)
		}
		unstructured.SetNestedField(unstructuredQuery, inputValue, "spec", "input")
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

func getConversationId(provided, existing string) string {
	if provided != "" {
		return provided
	}
	return existing
}

func createTriggerQuery(existingQuery *arkv1alpha1.Query, input runtime.RawExtension, params []arkv1alpha1.Parameter, sessionId string, conversationId string, timeout *time.Duration) (*arkv1alpha1.Query, error) {
	queryName := fmt.Sprintf("cli-trigger-%d", time.Now().Unix())

	spec := &arkv1alpha1.QuerySpec{
		Input:          input,
		Target:         existingQuery.Spec.Target,
		Selector:       existingQuery.Spec.Selector,
		Parameters:     params,
		Memory:         existingQuery.Spec.Memory,
		ServiceAccount: existingQuery.Spec.ServiceAccount,
		SessionId:      getSessionId(sessionId, existingQuery.Spec.SessionId),
		ConversationId: getConversationId(conversationId, existingQuery.Spec.ConversationId),
	}

	// Set timeout - use provided timeout or inherit from existing query
	if timeout != nil {
		spec.Timeout = &metav1.Duration{Duration: *timeout}
	} else {
		spec.Timeout = existingQuery.Spec.Timeout
	}

	// Set TTL to 720 hours (30 days) to keep query resource around like other queries
	spec.TTL = &metav1.Duration{Duration: 720 * time.Hour}

	queryObjectMeta := &metav1.ObjectMeta{
		Name:        queryName,
		Namespace:   existingQuery.Namespace,
		Annotations: existingQuery.ObjectMeta.Annotations,
		Labels: map[string]string{
			annotations.TriggeredFrom: existingQuery.Name,
		},
		Finalizers: []string{"ark.mckinsey.com/finalizer"},
	}

	return &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: *queryObjectMeta,
		Spec:       *spec,
	}, nil
}
