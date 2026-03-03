package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResolveA2AExecutionCapabilityNilEngine(t *testing.T) {
	capability := resolveA2AExecutionCapability(nil)
	assert.Equal(t, executionCapabilityA2ANativeExternalEngine, capability)
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

func TestExecuteAgentA2ARejectsUnsupportedCapability(t *testing.T) {
	agent := &Agent{
		resolvedCapability: executionCapability("bogus-capability"),
		Name:               "test-agent",
		Namespace:          "default",
	}
	userMsg := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("hi")})
	result, err := agent.executeAgentA2A(context.Background(), userMsg, nil, nil, nil)
	require.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "unsupported execution capability")
	assert.Contains(t, err.Error(), "bogus-capability")
}

func TestResolveEffectiveEngineRef_NilRef(t *testing.T) {
	ref := resolveEffectiveEngineRef(nil, "test-ns")
	require.NotNil(t, ref)
	assert.Equal(t, DefaultExecutionEngineName, ref.Name)
	assert.Equal(t, "test-ns", ref.Namespace)
}

func TestResolveEffectiveEngineRef_ExistingRef(t *testing.T) {
	existing := &arkv1alpha1.ExecutionEngineRef{Name: "custom", Namespace: "my-ns"}
	ref := resolveEffectiveEngineRef(existing, "default")
	assert.Equal(t, existing, ref)
}
