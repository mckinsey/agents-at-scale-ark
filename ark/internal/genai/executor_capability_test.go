package genai

import (
	"testing"

	"github.com/stretchr/testify/assert"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResolveA2AExecutionCapabilityNilEngine(t *testing.T) {
	capability := resolveA2AExecutionCapability(nil)
	assert.Equal(t, executionCapabilityA2ANativeLocal, capability)
}

func TestResolveA2AExecutionCapabilityReservedA2AEngine(t *testing.T) {
	capability := resolveA2AExecutionCapability(&arkv1alpha1.ExecutionEngineRef{Name: ExecutionEngineA2A})
	assert.Equal(t, executionCapabilityA2ANativeA2AEngine, capability)
}

func TestResolveA2AExecutionCapabilityNamedEngineDefaultsToNative(t *testing.T) {
	capability := resolveA2AExecutionCapability(&arkv1alpha1.ExecutionEngineRef{Name: "langchain-engine"})
	assert.Equal(t, executionCapabilityA2ANativeExternalEngine, capability)
}

func TestResolveA2AExecutionCapabilityUnknownEngineDefaultsToNative(t *testing.T) {
	capability := resolveA2AExecutionCapability(&arkv1alpha1.ExecutionEngineRef{Name: "custom-engine"})
	assert.Equal(t, executionCapabilityA2ANativeExternalEngine, capability)
}
