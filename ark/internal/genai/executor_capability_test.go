package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestResolveA2AExecutionCapabilityNilEngine(t *testing.T) {
	capability, err := resolveA2AExecutionCapability(context.Background(), nil, "default/agent", "default", nil)
	require.NoError(t, err)
	assert.Equal(t, executionCapabilityA2ANativeLocal, capability)
}

func TestResolveA2AExecutionCapabilityReservedA2AEngine(t *testing.T) {
	capability, err := resolveA2AExecutionCapability(context.Background(), nil, "default/agent", "default", &arkv1alpha1.ExecutionEngineRef{Name: ExecutionEngineA2A})
	require.NoError(t, err)
	assert.Equal(t, executionCapabilityA2ANativeA2AEngine, capability)
}

func TestResolveA2AExecutionCapabilityA2ALangChainNative(t *testing.T) {
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))
	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = "langchain-engine"
	engine.Namespace = "default"
	engine.Spec.Type = "a2a-langchain"
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	capability, err := resolveA2AExecutionCapability(context.Background(), k8sClient, "default/agent", "default", &arkv1alpha1.ExecutionEngineRef{Name: "langchain-engine"})
	require.NoError(t, err)
	assert.Equal(t, executionCapabilityA2ANativeExternalEngine, capability)
}

func TestResolveA2AExecutionCapabilityLangChainCompat(t *testing.T) {
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))
	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = "langchain-engine"
	engine.Namespace = "default"
	engine.Spec.Type = "langchain"
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	capability, err := resolveA2AExecutionCapability(context.Background(), k8sClient, "default/agent", "default", &arkv1alpha1.ExecutionEngineRef{Name: "langchain-engine"})
	require.NoError(t, err)
	assert.Equal(t, executionCapabilityOpenAICompat, capability)
}

func TestResolveA2AExecutionCapabilityUnknownEngineFails(t *testing.T) {
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))
	engine := &arkv1prealpha1.ExecutionEngine{}
	engine.Name = "custom-engine"
	engine.Namespace = "default"
	engine.Spec.Type = "custom"
	k8sClient := fake.NewClientBuilder().WithScheme(scheme).WithObjects(engine).Build()

	_, err := resolveA2AExecutionCapability(context.Background(), k8sClient, "default/agent", "default", &arkv1alpha1.ExecutionEngineRef{Name: "custom-engine"})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not supported in experimental A2A mode")
}
