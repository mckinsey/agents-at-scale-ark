package completions

import (
	"testing"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkmcp "mckinsey.com/ark/internal/mcp"
)

func inlineTool(name, address string, uid types.UID) *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default", UID: uid, Generation: 1},
		Spec: arkv1alpha1.ToolSpec{
			Type:   arkv1alpha1.ToolTypeInline,
			Inline: &arkv1alpha1.InlineSpec{Source: "echo hi", Language: arkv1alpha1.InlineLanguageBash},
		},
		Status: arkv1alpha1.ToolStatus{
			State:           arkv1alpha1.ToolStateReady,
			ResolvedAddress: address,
			Conditions: []metav1.Condition{{
				Type:               arkv1alpha1.ToolConditionAvailable,
				Status:             metav1.ConditionTrue,
				Reason:             arkv1alpha1.ToolReasonAvailable,
				ObservedGeneration: 1,
				LastTransitionTime: metav1.Now(),
			}},
		},
	}
}

func testPool(t *testing.T) *arkmcp.MCPClientPool {
	t.Helper()
	pool := arkmcp.NewMCPClientPool()
	t.Cleanup(func() { _ = pool.Close() })
	return pool
}

func TestCreateToolExecutorInlineUsesMCPExecutor(t *testing.T) {
	tool := inlineTool(testToolGreet, newTestMCPServer(t), "uid-1")

	executor, err := CreateToolExecutor(t.Context(), setupTestClientForTools([]client.Object{tool}), tool, "default",
		ToolExecutorDeps{MCPPool: testPool(t)})
	require.NoError(t, err)

	mcpExecutor, ok := executor.(*MCPExecutor)
	require.True(t, ok, "inline tools must reuse the existing MCP executor")
	require.Equal(t, tool.Name, mcpExecutor.ToolName, "the authored Tool name is the MCP tool name")

	result, err := mcpExecutor.Execute(t.Context(), greetCall())
	require.NoError(t, err)
	require.Equal(t, "Hi ark", result.Content)
}

func TestInlineToolFailureUsesSharedMCPResultHandling(t *testing.T) {
	tool := inlineTool(testToolBoom, newTestMCPServer(t), "uid-1")

	executor, err := CreateToolExecutor(t.Context(), setupTestClientForTools([]client.Object{tool}), tool, "default",
		ToolExecutorDeps{MCPPool: testPool(t)})
	require.NoError(t, err)

	result, err := executor.Execute(t.Context(), boomCall())

	require.NoError(t, err, "an inline script failure is a tool result, not a transport error")
	require.Equal(t, testToolBoomText, result.Error, "inline failures reuse the MCP isError path")
	require.Empty(t, result.Content)
}

func TestCreateToolExecutorInlineDoesNotReuseMCPServerClient(t *testing.T) {
	inlineEndpoint := newTestMCPServer(t)
	serverEndpoint := newTestMCPServer(t)
	require.NotEqual(t, inlineEndpoint, serverEndpoint)

	tool := inlineTool(testToolGreet, inlineEndpoint, "uid-1")
	mcpServer := &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: testToolGreet, Namespace: "default"},
		Spec: arkv1alpha1.MCPServerSpec{
			Address:   arkv1alpha1.ValueSource{Value: serverEndpoint},
			Transport: "http",
			Timeout:   "5s",
		},
	}
	mcpTool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "hosted-greet", Namespace: "default"},
		Spec: arkv1alpha1.ToolSpec{
			Type: ToolTypeMCP,
			MCP: &arkv1alpha1.MCPToolRef{
				MCPServerRef: arkv1alpha1.MCPServerRef{Name: testToolGreet, Namespace: "default"},
				ToolName:     testToolGreet,
			},
		},
	}

	k8sClient := setupTestClientForTools([]client.Object{tool, mcpServer, mcpTool})
	pool := testPool(t)
	deps := ToolExecutorDeps{MCPPool: pool}

	hosted, err := CreateToolExecutor(t.Context(), k8sClient, mcpTool, "default", deps)
	require.NoError(t, err)
	inline, err := CreateToolExecutor(t.Context(), k8sClient, tool, "default", deps)
	require.NoError(t, err)

	require.NotSame(t, hosted.(*MCPExecutor).MCPClient, inline.(*MCPExecutor).MCPClient,
		"an inline Tool must not share the pooled client of a same-named MCPServer")
}

func TestCreateToolExecutorInlineRejectsUnusableStatus(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*arkv1alpha1.Tool)
	}{
		{"no available condition", func(tool *arkv1alpha1.Tool) { tool.Status.Conditions = nil }},
		{"available is false", func(tool *arkv1alpha1.Tool) {
			tool.Status.Conditions[0].Status = metav1.ConditionFalse
			tool.Status.Conditions[0].Reason = arkv1alpha1.ToolReasonActivatorUnavailable
		}},
		{"stale generation", func(tool *arkv1alpha1.Tool) { tool.Generation = 2 }},
		{"pending state", func(tool *arkv1alpha1.Tool) { tool.Status.State = arkv1alpha1.ToolStatePending }},
		{"no published endpoint", func(tool *arkv1alpha1.Tool) { tool.Status.ResolvedAddress = "" }},
		{"deleting", func(tool *arkv1alpha1.Tool) {
			now := metav1.Now()
			tool.DeletionTimestamp = &now
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tool := inlineTool(testToolGreet, newTestMCPServer(t), "uid-1")
			tt.mutate(tool)

			executor, err := CreateToolExecutor(t.Context(), setupTestClientForTools(nil), tool, "default",
				ToolExecutorDeps{MCPPool: testPool(t)})

			require.ErrorContains(t, err, "is not usable")
			require.Nil(t, executor)
		})
	}
}

func TestRegisterInlineToolPreservesAttachmentAliasAndApproval(t *testing.T) {
	tool := inlineTool(testToolGreet, newTestMCPServer(t), "uid-1")
	tool.Spec.Approval = &arkv1alpha1.ToolApprovalConfig{Required: true}

	registry := NewToolRegistry(nil, nil, nil)
	t.Cleanup(func() { _ = registry.mcpPool.Close() })

	agentTool := arkv1alpha1.AgentTool{
		Type:        arkv1alpha1.ToolTypeInline,
		Name:        "say-hello",
		Description: "alias description",
		Partial:     &arkv1alpha1.ToolPartial{Name: testToolGreet},
	}

	require.NoError(t, registry.registerTool(t.Context(), setupTestClientForTools([]client.Object{tool}), agentTool, "default", nil, nil))

	definition, ok := registry.tools[testToolGreet]
	require.True(t, ok, "a renaming partial registers under the partial name")
	require.Equal(t, "alias description", definition.Description)
	require.NotNil(t, registry.ToolApproval(testToolGreet))

	partial, ok := registry.executors[testToolGreet].(*PartialToolExecutor)
	require.True(t, ok)
	require.Equal(t, testToolGreet, partial.BaseExecutor.(*MCPExecutor).ToolName)
}
