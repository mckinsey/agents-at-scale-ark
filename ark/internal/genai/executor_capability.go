package genai

import (
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type executionCapability string

const (
	executionCapabilityA2ANativeA2AEngine      executionCapability = "a2a-native-a2a-engine"
	executionCapabilityA2ANativeExternalEngine executionCapability = "a2a-native-external-engine"

	DefaultExecutionEngineName = "default"
)

func resolveA2AExecutionCapability(engineRef *arkv1alpha1.ExecutionEngineRef) executionCapability {
	if engineRef == nil {
		return executionCapabilityA2ANativeExternalEngine
	}
	if engineRef.Name == ExecutionEngineA2A {
		return executionCapabilityA2ANativeA2AEngine
	}
	return executionCapabilityA2ANativeExternalEngine
}

func resolveEffectiveEngineRef(engineRef *arkv1alpha1.ExecutionEngineRef, namespace string) *arkv1alpha1.ExecutionEngineRef {
	if engineRef != nil {
		return engineRef
	}
	return &arkv1alpha1.ExecutionEngineRef{
		Name:      DefaultExecutionEngineName,
		Namespace: namespace,
	}
}
