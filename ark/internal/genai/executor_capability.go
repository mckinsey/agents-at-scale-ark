package genai

import (
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type executionCapability string

const (
	executionCapabilityA2ANativeA2AEngine      executionCapability = "a2a-native-a2a-engine"
	executionCapabilityA2ANativeExternalEngine executionCapability = "a2a-native-external-engine"
	executionCapabilityA2ANativeLocal          executionCapability = "a2a-native-local"
)

func resolveA2AExecutionCapability(engineRef *arkv1alpha1.ExecutionEngineRef) executionCapability {
	if engineRef == nil {
		return executionCapabilityA2ANativeLocal
	}
	if engineRef.Name == ExecutionEngineA2A {
		return executionCapabilityA2ANativeA2AEngine
	}
	return executionCapabilityA2ANativeExternalEngine
}
