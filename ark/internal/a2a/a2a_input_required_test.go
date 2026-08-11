/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

// Both A2A transports — the A2AServer path and the named-engine path — funnel
// through here, so the limitation and its wording must be stated once.
func TestExtractTextFromTaskInputRequired(t *testing.T) {
	task := &protocol.Task{
		ID:     "task-1",
		Status: protocol.TaskStatus{State: protocol.TaskState(TaskStateInputRequired)},
	}

	_, err := ExtractTextFromTask(task)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "task-1")
	assert.Contains(t, err.Error(), "human-in-the-loop approval is not supported")
}
