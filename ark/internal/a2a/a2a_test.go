package a2a

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

func TestExtractTextFromTask(t *testing.T) {
	tests := []struct {
		name        string
		task        *protocol.Task
		expected    string
		expectError bool
		errorMsg    string
	}{
		{
			name: "completed task with single agent message",
			task: &protocol.Task{
				ID: "task-1",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Task completed successfully"},
						},
					},
				},
			},
			expected:    "Task completed successfully",
			expectError: false,
		},
		{
			name: "completed task with multiple agent messages",
			task: &protocol.Task{
				ID: "task-2",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Starting countdown from 2 seconds..."},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "1 seconds remaining..."},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "0 seconds remaining..."},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Countdown complete!"},
						},
					},
				},
			},
			expected:    "Starting countdown from 2 seconds...\n1 seconds remaining...\n0 seconds remaining...\nCountdown complete!",
			expectError: false,
		},
		{
			name: "completed task with user and agent messages",
			task: &protocol.Task{
				ID: "task-3",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleUser,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "User message"},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Agent response"},
						},
					},
				},
			},
			expected:    "Agent response",
			expectError: false,
		},
		{
			name: "failed task with error message",
			task: &protocol.Task{
				ID: "task-4",
				Status: protocol.TaskStatus{
					State: TaskStateFailed,
					Message: &protocol.Message{
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Cannot countdown from negative number -1"},
						},
					},
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "Cannot countdown from negative number -1",
		},
		{
			name: "failed task without error message",
			task: &protocol.Task{
				ID: "task-5",
				Status: protocol.TaskStatus{
					State: TaskStateFailed,
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "task failed",
		},
		{
			name: "task with no state",
			task: &protocol.Task{
				ID: "task-6",
				Status: protocol.TaskStatus{
					State: "",
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "task has no status state",
		},
		{
			name: "task in unexpected state",
			task: &protocol.Task{
				ID: "task-7",
				Status: protocol.TaskStatus{
					State: TaskStateWorking,
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "task in state 'working' (expected completed or failed)",
		},
		{
			name: "completed task with only non-agent messages",
			task: &protocol.Task{
				ID: "task-nonagent",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleUser,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "User message 1"},
						},
					},
					{
						Role: protocol.MessageRoleUser,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "User message 2"},
						},
					},
				},
			},
			expected:    "",
			expectError: false,
		},
		{
			name: "failed task with multiple status message parts",
			task: &protocol.Task{
				ID: "task-failparts",
				Status: protocol.TaskStatus{
					State: TaskStateFailed,
					Message: &protocol.Message{
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Error: "},
							protocol.TextPart{Text: "timeout exceeded"},
						},
					},
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "Error: timeout exceeded",
		},
		{
			name: "completed task with empty history",
			task: &protocol.Task{
				ID: "task-8",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{},
			},
			expected:    "",
			expectError: false,
		},
		{
			name: "completed task with agent messages containing multiple parts",
			task: &protocol.Task{
				ID: "task-9",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Part 1 "},
							protocol.TextPart{Text: "Part 2"},
						},
					},
				},
			},
			expected:    "Part 1 Part 2",
			expectError: false,
		},
		{
			name: "completed task with result only in text artifact",
			task: &protocol.Task{
				ID: "task-artifact",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				Artifacts: []protocol.Artifact{
					{
						ArtifactID: "artifact-1",
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Answer from artifact"},
						},
					},
				},
			},
			expected:    "Answer from artifact",
			expectError: false,
		},
		{
			name: "completed task prefers artifacts over history",
			task: &protocol.Task{
				ID: "task-history-and-artifact",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Answer from history"},
						},
					},
				},
				Artifacts: []protocol.Artifact{
					{
						ArtifactID: "artifact-1",
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Answer from artifact"},
						},
					},
				},
			},
			expected:    "Answer from artifact",
			expectError: false,
		},
		{
			name: "completed task prefers terminal status message over history",
			task: &protocol.Task{
				ID: "task-status-and-history",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
					Message: &protocol.Message{
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Answer from status"},
						},
					},
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Answer from history"},
						},
					},
				},
			},
			expected:    "Answer from status",
			expectError: false,
		},
		{
			name: "completed task with multiple text artifacts",
			task: &protocol.Task{
				ID: "task-multi-artifact",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				Artifacts: []protocol.Artifact{
					{
						ArtifactID: "artifact-1",
						Parts: []protocol.Part{
							protocol.TextPart{Text: "First artifact"},
						},
					},
					{
						ArtifactID: "artifact-2",
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Second artifact"},
						},
					},
				},
			},
			expected:    "First artifact\nSecond artifact",
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExtractTextFromTask(tt.task)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
				assert.Equal(t, tt.expected, result)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestArtifactTexts(t *testing.T) {
	name := func(s string) *string { return &s }
	tests := []struct {
		name      string
		artifacts []protocol.Artifact
		expected  []string
	}{
		{
			name:      "nil artifacts",
			artifacts: nil,
			expected:  []string{},
		},
		{
			name: "single text artifact",
			artifacts: []protocol.Artifact{
				{ArtifactID: "a1", Parts: []protocol.Part{protocol.TextPart{Text: "one"}}},
			},
			expected: []string{"one"},
		},
		{
			name: "multi-part single artifact concatenates parts",
			artifacts: []protocol.Artifact{
				{ArtifactID: "a1", Parts: []protocol.Part{protocol.TextPart{Text: "one "}, protocol.TextPart{Text: "two"}}},
			},
			expected: []string{"one two"},
		},
		{
			name: "multiple distinct artifacts stay separate in order",
			artifacts: []protocol.Artifact{
				{ArtifactID: "a1", Parts: []protocol.Part{protocol.TextPart{Text: "first"}}},
				{ArtifactID: "a2", Parts: []protocol.Part{protocol.TextPart{Text: "second"}}},
			},
			expected: []string{"first", "second"},
		},
		{
			name: "same name collapses to latest",
			artifacts: []protocol.Artifact{
				{ArtifactID: "a1", Name: name("report"), Parts: []protocol.Part{protocol.TextPart{Text: "v1"}}},
				{ArtifactID: "a2", Name: name("report"), Parts: []protocol.Part{protocol.TextPart{Text: "v2"}}},
			},
			expected: []string{"v2"},
		},
		{
			name: "non-text artifact skipped",
			artifacts: []protocol.Artifact{
				{ArtifactID: "file-1", Parts: []protocol.Part{protocol.NewFilePartWithBytes("f.bin", "application/octet-stream", "YmluYXJ5")}},
				{ArtifactID: "text-1", Parts: []protocol.Part{protocol.TextPart{Text: "kept"}}},
			},
			expected: []string{"kept"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, ArtifactTexts(tt.artifacts))
		})
	}
}

func TestExtractTextFromParts(t *testing.T) {
	tests := []struct {
		name     string
		parts    []protocol.Part
		expected string
	}{
		{
			name: "single text part",
			parts: []protocol.Part{
				protocol.TextPart{Text: "Hello world"},
			},
			expected: "Hello world",
		},
		{
			name: "multiple text parts",
			parts: []protocol.Part{
				protocol.TextPart{Text: "Hello "},
				protocol.TextPart{Text: "world"},
			},
			expected: "Hello world",
		},
		{
			name: "text part pointer",
			parts: []protocol.Part{
				&protocol.TextPart{Text: "Pointer text"},
			},
			expected: "Pointer text",
		},
		{
			name:     "empty parts",
			parts:    []protocol.Part{},
			expected: "",
		},
		{
			name: "mixed text parts and pointers",
			parts: []protocol.Part{
				protocol.TextPart{Text: "Part 1 "},
				&protocol.TextPart{Text: "Part 2"},
			},
			expected: "Part 1 Part 2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ExtractTextFromParts(tt.parts)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestExtractApprovalTimeout(t *testing.T) {
	t.Run("nil metadata returns ok=false", func(t *testing.T) {
		d, ok := extractApprovalTimeout(nil)
		assert.False(t, ok)
		assert.Equal(t, time.Duration(0), d)
	})

	t.Run("missing timeout key returns ok=false", func(t *testing.T) {
		d, ok := extractApprovalTimeout(map[string]any{"other": "value"})
		assert.False(t, ok)
		assert.Equal(t, time.Duration(0), d)
	})

	t.Run("non-string timeout returns ok=false", func(t *testing.T) {
		d, ok := extractApprovalTimeout(map[string]any{"timeout": 42})
		assert.False(t, ok)
		assert.Equal(t, time.Duration(0), d)
	})

	t.Run("empty string returns ok=false", func(t *testing.T) {
		d, ok := extractApprovalTimeout(map[string]any{"timeout": ""})
		assert.False(t, ok)
		assert.Equal(t, time.Duration(0), d)
	})

	t.Run("malformed duration returns ok=false", func(t *testing.T) {
		d, ok := extractApprovalTimeout(map[string]any{"timeout": "not-a-duration"})
		assert.False(t, ok)
		assert.Equal(t, time.Duration(0), d)
	})

	t.Run("valid duration is parsed", func(t *testing.T) {
		d, ok := extractApprovalTimeout(map[string]any{"timeout": "5m"})
		assert.True(t, ok)
		assert.Equal(t, 5*time.Minute, d)
	})

	t.Run("compound duration is parsed", func(t *testing.T) {
		d, ok := extractApprovalTimeout(map[string]any{"timeout": "1h30m"})
		assert.True(t, ok)
		assert.Equal(t, 90*time.Minute, d)
	})
}

func TestExecuteA2AAgent(t *testing.T) {
	var captured map[string]any
	server := sendMessageStub(t, "server reply", &captured)

	response, err := ExecuteA2AAgent(t.Context(), nil, server.URL, nil, "default", "hello", "my-agent", "my-query", "ctx-1", nil, nil)

	require.NoError(t, err)
	require.NotNil(t, response)
	assert.Equal(t, "server reply", response.Content)
	assert.Equal(t, []string{"server reply"}, response.Messages)

	params, ok := captured["params"].(map[string]any)
	require.True(t, ok, "expected params on the request body")
	sentMessage, ok := params["message"].(map[string]any)
	require.True(t, ok, "expected a message on the request body")
	assert.Equal(t, "ctx-1", sentMessage["contextId"])
	assert.Nil(t, sentMessage["metadata"],
		"the A2AServer path carries no query extension; only the execution engine path does")
}

func TestExecuteA2AAgentRecordsParseFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var request map[string]any
		require.NoError(t, json.Unmarshal(body, &request))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      request["id"],
			"result": map[string]any{
				"kind":      "task",
				"id":        "task-1",
				"contextId": "ctx-1",
				"status":    map[string]any{},
			},
		}))
	}))
	t.Cleanup(server.Close)

	recorder := &recordingA2aRecorder{A2aRecorder: eventnoop.NewProvider().A2aRecorder()}

	response, err := ExecuteA2AAgent(t.Context(), nil, server.URL, nil, "default", "hello", "my-agent", "my-query", "", recorder, nil)

	require.Error(t, err)
	assert.Nil(t, response)
	require.Len(t, recorder.parseErrors, 1)
	assert.Contains(t, recorder.parseErrors[0], "Failed to parse A2A response")
}

func TestExtractResponseFromMessageResult(t *testing.T) {
	t.Run("nil result", func(t *testing.T) {
		_, err := ExtractResponseFromMessageResult(t.Context(), nil, nil, "my-agent", "default", "my-query", nil)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "result is nil")
	})

	t.Run("message result carries text and context", func(t *testing.T) {
		contextID := "ctx-1"
		result := &protocol.MessageResult{Result: &protocol.Message{
			Role:      protocol.MessageRoleAgent,
			Parts:     []protocol.Part{protocol.NewTextPart("agent said this")},
			ContextID: &contextID,
		}}

		response, err := ExtractResponseFromMessageResult(t.Context(), nil, result, "my-agent", "default", "my-query", nil)

		require.NoError(t, err)
		assert.Equal(t, "agent said this", response.Content)
		assert.Equal(t, []string{"agent said this"}, response.Messages)
		assert.Equal(t, "ctx-1", response.ContextID)
	})

	t.Run("empty message result has no messages", func(t *testing.T) {
		result := &protocol.MessageResult{Result: &protocol.Message{
			Role:  protocol.MessageRoleAgent,
			Parts: []protocol.Part{protocol.NewTextPart("")},
		}}

		response, err := ExtractResponseFromMessageResult(t.Context(), nil, result, "my-agent", "default", "my-query", nil)

		require.NoError(t, err)
		assert.Empty(t, response.Content)
		assert.Nil(t, response.Messages)
	})

	t.Run("unreadable task result", func(t *testing.T) {
		result := &protocol.MessageResult{Result: &protocol.Task{ID: "task-1"}}

		_, err := ExtractResponseFromMessageResult(t.Context(), nil, result, "my-agent", "default", "my-query", nil)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "task has no status state")
	})
}
