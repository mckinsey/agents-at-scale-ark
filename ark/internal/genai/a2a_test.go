package genai

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := extractTextFromTask(tt.task)

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
			result := extractTextFromParts(tt.parts)
			assert.Equal(t, tt.expected, result)
		})
	}
}
