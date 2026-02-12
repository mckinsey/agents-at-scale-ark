package genai

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

type executionCapability string

const (
	executionCapabilityA2ANativeA2AEngine      executionCapability = "a2a-native-a2a-engine"
	executionCapabilityA2ANativeExternalEngine executionCapability = "a2a-native-external-engine"
	executionCapabilityOpenAICompat            executionCapability = "openai-compat"
)

var knownOpenAICompatExecutionEngineTypes = map[string]struct{}{
	"langchain": {},
}

var knownA2ANativeExecutionEngineTypes = map[string]struct{}{
	"langchain": {},
}

func normalizeExecutionEngineType(engineType string) string {
	return strings.ToLower(strings.TrimSpace(engineType))
}

func listKnownExecutionEngineTypes(source map[string]struct{}) string {
	if len(source) == 0 {
		return ""
	}
	values := make([]string, 0, len(source))
	for value := range source {
		values = append(values, value)
	}
	sort.Strings(values)
	return strings.Join(values, ", ")
}

func resolveA2AExecutionCapability(ctx context.Context, k8sClient client.Client, fullName, defaultNamespace string, engineRef *arkv1alpha1.ExecutionEngineRef) (executionCapability, error) {
	if engineRef == nil {
		return executionCapabilityOpenAICompat, nil
	}
	if engineRef.Name == ExecutionEngineA2A {
		return executionCapabilityA2ANativeA2AEngine, nil
	}
	if k8sClient == nil {
		return "", fmt.Errorf("agent %s execution engine %s cannot be resolved without Kubernetes client", fullName, engineRef.Name)
	}

	namespace := engineRef.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	var engineCRD arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: engineRef.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, engineKey, &engineCRD); err != nil {
		return "", fmt.Errorf("failed to resolve execution engine %s for agent %s: %w", engineKey.String(), fullName, err)
	}

	engineType := normalizeExecutionEngineType(engineCRD.Spec.Type)
	if _, ok := knownA2ANativeExecutionEngineTypes[engineType]; ok {
		return executionCapabilityA2ANativeExternalEngine, nil
	}
	if _, ok := knownOpenAICompatExecutionEngineTypes[engineType]; ok {
		return executionCapabilityOpenAICompat, nil
	}

	return "", fmt.Errorf(
		"agent %s execution engine %s (type=%s) is not supported in experimental A2A mode; known A2A-native types: [%s]; known OpenAI-compat types: [%s]",
		fullName,
		engineRef.Name,
		engineCRD.Spec.Type,
		listKnownExecutionEngineTypes(knownA2ANativeExecutionEngineTypes),
		listKnownExecutionEngineTypes(knownOpenAICompatExecutionEngineTypes),
	)
}
