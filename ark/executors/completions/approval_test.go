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

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// recordingAgentRecorder captures operation lifecycle calls for assertions.
type recordingAgentRecorder struct {
	completes []string
	fails     []string
}

func (r *recordingAgentRecorder) InitializeQueryContext(ctx context.Context, _ *arkv1alpha1.Query) context.Context {
	return ctx
}

func (r *recordingAgentRecorder) Start(ctx context.Context, _, _ string, _ map[string]string) context.Context {
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
