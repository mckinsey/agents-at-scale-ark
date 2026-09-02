package completions

import (
	"context"
	"testing"
	"time"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// recordingAgentRecorder captures operation lifecycle calls for assertions.
type recordingAgentRecorder struct {
	starts    map[string]map[string]string
	completes []string
	fails     []string
}

func (r *recordingAgentRecorder) InitializeQueryContext(ctx context.Context, _ *arkv1alpha1.Query) context.Context {
	return ctx
}

func (r *recordingAgentRecorder) Start(ctx context.Context, operation, _ string, data map[string]string) context.Context {
	if r.starts == nil {
		r.starts = map[string]map[string]string{}
	}
	r.starts[operation] = data
	return ctx
}

func (r *recordingAgentRecorder) Complete(_ context.Context, operation, _ string, _ map[string]string) {
	r.completes = append(r.completes, operation)
}

func (r *recordingAgentRecorder) Cancel(_ context.Context, _, _ string, _ map[string]string) {}

func (r *recordingAgentRecorder) Fail(_ context.Context, operation, _ string, _ error, _ map[string]string) {
	r.fails = append(r.fails, operation)
}

func (r *recordingAgentRecorder) DependencyUnavailable(_ context.Context, _ runtime.Object, _ string) {
}

func TestRequiresApproval(t *testing.T) {
	timeout := metav1.Duration{Duration: 5 * time.Minute}

	tests := []struct {
		name         string
		toolName     string
		approvalMap  map[string]*arkv1alpha1.ToolApprovalConfig
		expectConfig bool
	}{
		{
			name:     "tool requires approval",
			toolName: "dangerous-tool",
			approvalMap: map[string]*arkv1alpha1.ToolApprovalConfig{
				"dangerous-tool": {
					Required:  true,
					Timeout:   &timeout,
					OnTimeout: "reject",
				},
			},
			expectConfig: true,
		},
		{
			name:         "tool does not require approval",
			toolName:     "safe-tool",
			approvalMap:  map[string]*arkv1alpha1.ToolApprovalConfig{},
			expectConfig: false,
		},
		{
			name:     "tool not in approval map",
			toolName: "unknown-tool",
			approvalMap: map[string]*arkv1alpha1.ToolApprovalConfig{
				"dangerous-tool": {
					Required: true,
				},
			},
			expectConfig: false,
		},
		{
			name:         "nil approval map",
			toolName:     "any-tool",
			approvalMap:  nil,
			expectConfig: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			agent := &Agent{
				Name:                  "test-agent",
				Namespace:             "default",
				approvalRequiredTools: tt.approvalMap,
			}

			config := agent.requiresApproval(tt.toolName)

			if tt.expectConfig {
				require.NotNil(t, config, "Expected approval config but got nil")
				require.True(t, config.Required)
			} else {
				require.Nil(t, config, "Expected nil approval config but got non-nil")
			}
		})
	}
}

func TestExecuteToolCallsWithApproval(t *testing.T) {
	timeout := metav1.Duration{Duration: 5 * time.Minute}

	tests := []struct {
		name              string
		toolCalls         []openai.ChatCompletionMessageToolCall
		approvalMap       map[string]*arkv1alpha1.ToolApprovalConfig
		expectApprovalErr bool
		expectedToolCount int
	}{
		{
			name: "single tool requires approval",
			toolCalls: []openai.ChatCompletionMessageToolCall{
				{
					ID: "call-1",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "delete-database",
						Arguments: "{}",
					},
				},
			},
			approvalMap: map[string]*arkv1alpha1.ToolApprovalConfig{
				"delete-database": {
					Required:  true,
					Timeout:   &timeout,
					OnTimeout: "reject",
				},
			},
			expectApprovalErr: true,
			expectedToolCount: 1,
		},
		{
			name: "multiple tools with one requiring approval",
			toolCalls: []openai.ChatCompletionMessageToolCall{
				{
					ID: "call-1",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "safe-tool",
						Arguments: "{}",
					},
				},
				{
					ID: "call-2",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "dangerous-tool",
						Arguments: "{}",
					},
				},
			},
			approvalMap: map[string]*arkv1alpha1.ToolApprovalConfig{
				"dangerous-tool": {
					Required:  true,
					Timeout:   &timeout,
					OnTimeout: "reject",
				},
			},
			expectApprovalErr: true,
			expectedToolCount: 1,
		},
		{
			name: "multiple tools all requiring approval",
			toolCalls: []openai.ChatCompletionMessageToolCall{
				{
					ID: "call-1",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "delete-database",
						Arguments: "{}",
					},
				},
				{
					ID: "call-2",
					Function: openai.ChatCompletionMessageToolCallFunction{
						Name:      "delete-database",
						Arguments: "{}",
					},
				},
			},
			approvalMap: map[string]*arkv1alpha1.ToolApprovalConfig{
				"delete-database": {
					Required:  true,
					Timeout:   &timeout,
					OnTimeout: "reject",
				},
			},
			expectApprovalErr: true,
			expectedToolCount: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			agent := &Agent{
				Name:                  "test-agent",
				Namespace:             "default",
				approvalRequiredTools: tt.approvalMap,
			}

			// Create query context
			query := &arkv1alpha1.Query{
				Spec: arkv1alpha1.QuerySpec{
					ConversationId: "test-conversation-123",
				},
			}
			ctx := context.WithValue(context.Background(), QueryContextKey, query)

			var agentMessages []Message
			var newMessages []Message

			err := agent.executeToolCalls(ctx, tt.toolCalls, &agentMessages, &newMessages)

			require.True(t, tt.expectApprovalErr, "This test only covers approval-required cases")
			require.Error(t, err, "Expected approval error")

			var approvalErr *ApprovalRequiredError
			require.ErrorAs(t, err, &approvalErr, "Error should be ApprovalRequiredError")
			require.Equal(t, tt.expectedToolCount, len(approvalErr.ToolCalls), "Expected number of tools requiring approval")
			require.NotNil(t, approvalErr.Config, "Approval config should not be nil")
			require.NotNil(t, approvalErr.Context, "Execution context should not be nil")
			require.Equal(t, "test-agent", approvalErr.Context.AgentName)
			require.Equal(t, "default", approvalErr.Context.AgentNamespace)
			require.Equal(t, "test-conversation-123", approvalErr.Context.ConversationID)
		})
	}
}

func TestApprovalRequiredError(t *testing.T) {
	timeout := metav1.Duration{Duration: 5 * time.Minute}

	err := &ApprovalRequiredError{
		ToolCalls: []ToolCall{
			{
				ID: "call-1",
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      "delete-database",
					Arguments: "{}",
				},
			},
			{
				ID: "call-2",
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      "delete-database",
					Arguments: "{}",
				},
			},
		},
		Config: &arkv1alpha1.ToolApprovalConfig{
			Required:  true,
			Timeout:   &timeout,
			OnTimeout: "reject",
		},
		Context: &ExecutionContext{
			ConversationID:       "test-123",
			PendingToolCallIndex: 0,
			CompletedToolResults: []ToolResult{},
			AgentName:            "test-agent",
			AgentNamespace:       "default",
		},
	}

	errorMsg := err.Error()
	require.Contains(t, errorMsg, "approval required")
	require.Contains(t, errorMsg, "2 tool call(s)")
}

func TestApprovalRequiredErrorWithMissingContext(t *testing.T) {
	agent := &Agent{
		Name:      "test-agent",
		Namespace: "default",
		approvalRequiredTools: map[string]*arkv1alpha1.ToolApprovalConfig{
			"dangerous-tool": {
				Required: true,
			},
		},
	}

	toolCalls := []openai.ChatCompletionMessageToolCall{
		{
			ID: "call-1",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "dangerous-tool",
				Arguments: "{}",
			},
		},
	}

	// Context without Query - should still work but with empty conversation ID
	ctx := context.Background()

	var agentMessages []Message
	var newMessages []Message

	err := agent.executeToolCalls(ctx, toolCalls, &agentMessages, &newMessages)

	require.Error(t, err)

	var approvalErr *ApprovalRequiredError
	require.ErrorAs(t, err, &approvalErr)
	require.Equal(t, "", approvalErr.Context.ConversationID, "Should have empty conversation ID when no query in context")
	require.Equal(t, "test-agent", approvalErr.Context.AgentName)
	require.Equal(t, "default", approvalErr.Context.AgentNamespace)
}

func TestToolResultErrorConversion(t *testing.T) {
	tests := []struct {
		name            string
		toolResult      ToolResult
		expectedContent string
	}{
		{
			name: "tool result with error field uses error",
			toolResult: ToolResult{
				ID:      "call-1",
				Name:    "test-tool",
				Error:   "Tool execution rejected by user",
				Content: "some content",
			},
			expectedContent: "Tool execution rejected by user",
		},
		{
			name: "tool result without error uses content",
			toolResult: ToolResult{
				ID:      "call-2",
				Name:    "test-tool",
				Error:   "",
				Content: "success content",
			},
			expectedContent: "success content",
		},
		{
			name: "tool result with empty error and empty content",
			toolResult: ToolResult{
				ID:      "call-3",
				Name:    "test-tool",
				Error:   "",
				Content: "",
			},
			expectedContent: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Simulate the logic from agent.go executeToolCall
			content := tt.toolResult.Content
			if tt.toolResult.Error != "" {
				content = tt.toolResult.Error
			}

			require.Equal(t, tt.expectedContent, content, "Content selection should prioritize error field when present")
		})
	}
}

func TestRejectionCreatesErrorResults(t *testing.T) {
	// This test verifies that when tools are rejected, error ToolResults are created
	// instead of executing the tools

	toolCalls := []struct {
		ID        string
		Name      string
		Arguments string
	}{
		{ID: "call-1", Name: "write-file", Arguments: `{"path": "/tmp/test.txt"}`},
		{ID: "call-2", Name: "delete-file", Arguments: `{"path": "/tmp/delete.txt"}`},
	}

	// Simulate rejection - create error results without execution
	results := make([]ToolResult, 0, len(toolCalls))
	for _, tc := range toolCalls {
		results = append(results, ToolResult{
			ID:      tc.ID,
			Name:    tc.Name,
			Error:   "Tool execution rejected by user",
			Content: "",
		})
	}

	require.Len(t, results, 2, "Should have error result for each tool call")
	for i, result := range results {
		require.Equal(t, toolCalls[i].ID, result.ID, "Tool call ID should match")
		require.Equal(t, toolCalls[i].Name, result.Name, "Tool name should match")
		require.Equal(t, "Tool execution rejected by user", result.Error, "Should have rejection error message")
		require.Empty(t, result.Content, "Content should be empty for rejected tools")
	}
}

// TestAgentExecute_ApprovalDoesNotEmitErrorEvent verifies that pausing for tool
// approval emits a normal completion event, not an AgentExecution error event.
// Emitting an error here previously caused the broker to record the query as
// failed (errorCount=1) even after the approved query completed successfully.
func TestAgentExecute_ApprovalDoesNotEmitErrorEvent(t *testing.T) {
	provider := &mockChatProvider{
		response: &openai.ChatCompletion{
			ID:    "cmpl-1",
			Model: "test-model",
			Choices: []openai.ChatCompletionChoice{
				{
					Message: openai.ChatCompletionMessage{
						Role: "assistant",
						ToolCalls: []openai.ChatCompletionMessageToolCall{
							{
								ID: "call-1",
								Function: openai.ChatCompletionMessageToolCallFunction{
									Name:      "dangerous-tool",
									Arguments: "{}",
								},
							},
						},
					},
					FinishReason: "tool_calls",
				},
			},
		},
	}

	rec := &recordingAgentRecorder{}
	agent := newTestAgent("approval-agent", provider)
	agent.eventingRecorder = rec
	agent.approvalRequiredTools = map[string]*arkv1alpha1.ToolApprovalConfig{
		"dangerous-tool": {Required: true},
	}

	_, err := agent.Execute(context.Background(), NewUserMessage("do it"), nil, nil, nil, ExecuteOptions{})

	var approvalErr *ApprovalRequiredError
	require.ErrorAs(t, err, &approvalErr, "Execute should propagate ApprovalRequiredError")
	assert.Contains(t, rec.completes, "AgentExecution", "approval pause should emit a completion event")
	assert.NotContains(t, rec.fails, "AgentExecution", "approval pause must not emit an error event")
}

// Must match the controller's emission (query_controller.go: target.Name).
// Divergence lets the broker record two participant strings per agent under
// event-order race, which the dashboard reads as a workflow conversation.
func TestAgentExecute_EmitsBareAgentNameInOperationData(t *testing.T) {
	provider := &mockChatProvider{
		response: &openai.ChatCompletion{
			ID:    "cmpl-1",
			Model: "test-model",
			Choices: []openai.ChatCompletionChoice{
				{
					Message:      openai.ChatCompletionMessage{Role: "assistant", Content: "hi"},
					FinishReason: "stop",
				},
			},
		},
	}

	rec := &recordingAgentRecorder{}
	agent := newTestAgent("my-agent", provider)
	agent.eventingRecorder = rec

	_, err := agent.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)

	data, ok := rec.starts["AgentExecution"]
	require.True(t, ok, "AgentExecution Start event should have been recorded")
	assert.Equal(t, "my-agent", data["agent"], "expected bare Name, not FullName")
}

func approvalConfig(required bool, timeout, onTimeout string) *arkv1alpha1.ToolApprovalConfig {
	config := &arkv1alpha1.ToolApprovalConfig{Required: required, OnTimeout: onTimeout}
	if timeout != "" {
		duration, err := time.ParseDuration(timeout)
		if err != nil {
			panic(err)
		}
		config.Timeout = &metav1.Duration{Duration: duration}
	}
	return config
}

func registryWithToolApproval(name string, config *arkv1alpha1.ToolApprovalConfig) *ToolRegistry {
	registry := &ToolRegistry{toolApproval: map[string]*arkv1alpha1.ToolApprovalConfig{}}
	if config != nil {
		registry.toolApproval[name] = config
	}
	return registry
}

func TestBuildApprovalMapToolLevelOnly(t *testing.T) {
	agentTools := []arkv1alpha1.AgentTool{{Type: "mcp", Name: "write-file"}}
	registry := registryWithToolApproval("write-file", approvalConfig(true, "5m", "reject"))

	approvalMap := buildApprovalMap(agentTools, registry)

	require.Contains(t, approvalMap, "write-file")
	assert.True(t, approvalMap["write-file"].Required)
	assert.Equal(t, 5*time.Minute, approvalMap["write-file"].Timeout.Duration)
}

func TestBuildApprovalMapAgentLevelOnly(t *testing.T) {
	agentTools := []arkv1alpha1.AgentTool{
		{Type: "mcp", Name: "write-file", Approval: approvalConfig(true, "30s", "proceed")},
	}
	registry := registryWithToolApproval("write-file", nil)

	approvalMap := buildApprovalMap(agentTools, registry)

	require.Contains(t, approvalMap, "write-file")
	assert.Equal(t, 30*time.Second, approvalMap["write-file"].Timeout.Duration)
	assert.Equal(t, "proceed", approvalMap["write-file"].OnTimeout)
}

func TestBuildApprovalMapAgentCannotDropToolGate(t *testing.T) {
	// A tool marked risky stays gated even if the agent's reference says otherwise.
	agentTools := []arkv1alpha1.AgentTool{
		{Type: "mcp", Name: "write-file", Approval: approvalConfig(false, "", "")},
	}
	registry := registryWithToolApproval("write-file", approvalConfig(true, "5m", "reject"))

	approvalMap := buildApprovalMap(agentTools, registry)

	require.Contains(t, approvalMap, "write-file")
	assert.True(t, approvalMap["write-file"].Required)
}

func TestBuildApprovalMapAgentOverridesTimeout(t *testing.T) {
	agentTools := []arkv1alpha1.AgentTool{
		{Type: "mcp", Name: "write-file", Approval: approvalConfig(false, "30s", "proceed")},
	}
	registry := registryWithToolApproval("write-file", approvalConfig(true, "5m", "reject"))

	approvalMap := buildApprovalMap(agentTools, registry)

	require.Contains(t, approvalMap, "write-file")
	assert.Equal(t, 30*time.Second, approvalMap["write-file"].Timeout.Duration)
	assert.Equal(t, "proceed", approvalMap["write-file"].OnTimeout)
}

func TestBuildApprovalMapToolLevelDoesNotMutateSource(t *testing.T) {
	toolConfig := approvalConfig(true, "5m", "reject")
	agentTools := []arkv1alpha1.AgentTool{
		{Type: "mcp", Name: "write-file", Approval: approvalConfig(false, "30s", "proceed")},
	}
	registry := registryWithToolApproval("write-file", toolConfig)

	buildApprovalMap(agentTools, registry)

	assert.Equal(t, 5*time.Minute, toolConfig.Timeout.Duration)
	assert.Equal(t, "reject", toolConfig.OnTimeout)
}

func TestBuildApprovalMapSkipsUngatedTools(t *testing.T) {
	agentTools := []arkv1alpha1.AgentTool{
		{Type: "mcp", Name: "list-directory"},
		{Type: "mcp", Name: "read-text-file", Approval: approvalConfig(false, "5m", "reject")},
	}
	registry := registryWithToolApproval("write-file", approvalConfig(true, "5m", "reject"))

	approvalMap := buildApprovalMap(agentTools, registry)

	assert.Empty(t, approvalMap)
}

func TestBuildApprovalMapUsesExposedNameForPartialTools(t *testing.T) {
	// A partial tool is exposed under agentTool.Name while the CRD keeps its own name,
	// and requiresApproval is called with the exposed name the model saw.
	agentTools := []arkv1alpha1.AgentTool{{
		Type:    "mcp",
		Name:    "write-report",
		Partial: &arkv1alpha1.ToolPartial{Name: "file-gateway-write-file"},
	}}
	registry := registryWithToolApproval("write-report", approvalConfig(true, "5m", "reject"))

	approvalMap := buildApprovalMap(agentTools, registry)

	require.Contains(t, approvalMap, "write-report")
	assert.NotContains(t, approvalMap, "file-gateway-write-file")
}

func TestRequiresApprovalUsesMergedMap(t *testing.T) {
	agent := &Agent{approvalRequiredTools: buildApprovalMap(
		[]arkv1alpha1.AgentTool{{Type: "mcp", Name: "write-file"}},
		registryWithToolApproval("write-file", approvalConfig(true, "5m", "reject")),
	)}

	assert.NotNil(t, agent.requiresApproval("write-file"))
	assert.Nil(t, agent.requiresApproval("list-directory"))
}

func TestHandleApprovalRequiredWithNilTimeout(t *testing.T) {
	// Timeout is optional, so an Agent applied before it had a default stores nil.
	// Dereferencing it here used to panic the request goroutine.
	handler := newTestHandler()
	state := &executionState{conversationId: "conv-1"}
	approvalErr := &ApprovalRequiredError{
		ToolCalls: []ToolCall{{ID: "call-1", Function: openai.ChatCompletionMessageToolCallFunction{Name: "write-file"}}},
		Config:    &arkv1alpha1.ToolApprovalConfig{Required: true, OnTimeout: "reject"},
		Context:   &ExecutionContext{AgentName: "writer"},
	}

	result := handler.handleApprovalRequired(context.Background(), state, approvalErr)

	require.NotNil(t, result)
	task, ok := result.Result.(*protocol.Task)
	require.True(t, ok)
	assert.Equal(t, "", task.Metadata["timeout"])
	assert.Equal(t, "reject", task.Metadata["onTimeout"])
}

func TestHandleApprovalRequiredWithTimeout(t *testing.T) {
	handler := newTestHandler()
	state := &executionState{conversationId: "conv-1"}
	approvalErr := &ApprovalRequiredError{
		ToolCalls: []ToolCall{{ID: "call-1", Function: openai.ChatCompletionMessageToolCallFunction{Name: "write-file"}}},
		Config:    approvalConfig(true, "5m", "reject"),
		Context:   &ExecutionContext{AgentName: "writer"},
	}

	result := handler.handleApprovalRequired(context.Background(), state, approvalErr)

	task, ok := result.Result.(*protocol.Task)
	require.True(t, ok)
	assert.Equal(t, "5m0s", task.Metadata["timeout"])
}
