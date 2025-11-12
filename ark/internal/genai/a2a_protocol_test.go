/* Copyright 2025. McKinsey & Company */

package genai

import (
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

func TestConvertA2AStateToPhase(t *testing.T) {
	tests := []struct {
		name     string
		state    string
		expected string
	}{
		{
			name:     "submitted maps to assigned",
			state:    "submitted",
			expected: PhaseAssigned,
		},
		{
			name:     "working maps to running",
			state:    "working",
			expected: PhaseRunning,
		},
		{
			name:     "input-required maps to input-required phase",
			state:    "input-required",
			expected: PhaseInputRequired,
		},
		{
			name:     "auth-required maps to auth-required phase",
			state:    "auth-required",
			expected: PhaseAuthRequired,
		},
		{
			name:     "completed maps to completed",
			state:    "completed",
			expected: PhaseCompleted,
		},
		{
			name:     "failed maps to failed",
			state:    "failed",
			expected: PhaseFailed,
		},
		{
			name:     "canceled maps to cancelled",
			state:    "canceled",
			expected: PhaseCancelled,
		},
		{
			name:     "rejected maps to failed",
			state:    "rejected",
			expected: PhaseFailed,
		},
		{
			name:     "unknown state maps to unknown",
			state:    "some-unknown-state",
			expected: PhaseUnknown,
		},
		{
			name:     "empty state maps to unknown",
			state:    "",
			expected: PhaseUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ConvertA2AStateToPhase(tt.state)
			if result != tt.expected {
				t.Errorf("ConvertA2AStateToPhase(%q) = %q, want %q", tt.state, result, tt.expected)
			}
		})
	}
}

func TestIsTerminalPhase(t *testing.T) {
	tests := []struct {
		name     string
		phase    string
		expected bool
	}{
		{
			name:     "completed is terminal",
			phase:    PhaseCompleted,
			expected: true,
		},
		{
			name:     "failed is terminal",
			phase:    PhaseFailed,
			expected: true,
		},
		{
			name:     "cancelled is terminal",
			phase:    PhaseCancelled,
			expected: true,
		},
		{
			name:     "pending is not terminal",
			phase:    PhasePending,
			expected: false,
		},
		{
			name:     "assigned is not terminal",
			phase:    PhaseAssigned,
			expected: false,
		},
		{
			name:     "running is not terminal",
			phase:    PhaseRunning,
			expected: false,
		},
		{
			name:     "input-required is not terminal",
			phase:    PhaseInputRequired,
			expected: false,
		},
		{
			name:     "auth-required is not terminal",
			phase:    PhaseAuthRequired,
			expected: false,
		},
		{
			name:     "unknown is not terminal",
			phase:    PhaseUnknown,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsTerminalPhase(tt.phase)
			if result != tt.expected {
				t.Errorf("IsTerminalPhase(%q) = %v, want %v", tt.phase, result, tt.expected)
			}
		})
	}
}

func TestConvertPartFromProtocol(t *testing.T) {
	tests := []struct {
		name     string
		part     interface{}
		expected arkv1alpha1.A2ATaskPart
	}{
		{
			name: "text part conversion",
			part: &protocol.TextPart{
				Text: "hello world",
			},
			expected: arkv1alpha1.A2ATaskPart{
				Kind: PartKindText,
				Text: "hello world",
			},
		},
		{
			name: "data part conversion",
			part: &protocol.DataPart{
				Data: "base64data",
			},
			expected: arkv1alpha1.A2ATaskPart{
				Kind: PartKindData,
				Data: "base64data",
			},
		},
		{
			name: "file part with URI",
			part: &protocol.FilePart{
				File: &protocol.FileWithURI{
					URI:      "https://example.com/file.pdf",
					MimeType: stringPtr("application/pdf"),
				},
			},
			expected: arkv1alpha1.A2ATaskPart{
				Kind:     PartKindFile,
				URI:      "https://example.com/file.pdf",
				MimeType: "application/pdf",
			},
		},
		{
			name: "file part with URI without mimetype",
			part: &protocol.FilePart{
				File: &protocol.FileWithURI{
					URI: "https://example.com/file",
				},
			},
			expected: arkv1alpha1.A2ATaskPart{
				Kind: PartKindFile,
				URI:  "https://example.com/file",
			},
		},
		{
			name: "file part with bytes",
			part: &protocol.FilePart{
				File: &protocol.FileWithBytes{
					Bytes:    "filecontents",
					MimeType: stringPtr("text/plain"),
				},
			},
			expected: arkv1alpha1.A2ATaskPart{
				Kind:     PartKindFile,
				Data:     "filecontents",
				MimeType: "text/plain",
			},
		},
		{
			name: "unknown part type",
			part: struct{}{},
			expected: arkv1alpha1.A2ATaskPart{
				Kind: PartKindText,
				Text: "unknown part type",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertPartFromProtocol(tt.part)
			if result.Kind != tt.expected.Kind {
				t.Errorf("Kind = %q, want %q", result.Kind, tt.expected.Kind)
			}
			if result.Text != tt.expected.Text {
				t.Errorf("Text = %q, want %q", result.Text, tt.expected.Text)
			}
			if result.Data != tt.expected.Data {
				t.Errorf("Data = %q, want %q", result.Data, tt.expected.Data)
			}
			if result.URI != tt.expected.URI {
				t.Errorf("URI = %q, want %q", result.URI, tt.expected.URI)
			}
			if result.MimeType != tt.expected.MimeType {
				t.Errorf("MimeType = %q, want %q", result.MimeType, tt.expected.MimeType)
			}
		})
	}
}

func TestConvertArtifactsFromProtocol(t *testing.T) {
	tests := []struct {
		name      string
		artifacts []protocol.Artifact
		expected  []arkv1alpha1.A2ATaskArtifact
	}{
		{
			name:      "empty artifacts",
			artifacts: []protocol.Artifact{},
			expected:  []arkv1alpha1.A2ATaskArtifact{},
		},
		{
			name: "artifact with text parts",
			artifacts: []protocol.Artifact{
				{
					ArtifactID:  "art-123",
					Name:        stringPtr("test artifact"),
					Description: stringPtr("test description"),
					Parts: []protocol.Part{
						protocol.TextPart{Text: "content1"},
						protocol.TextPart{Text: "content2"},
					},
					Metadata: map[string]any{
						"key1": "value1",
					},
				},
			},
			expected: []arkv1alpha1.A2ATaskArtifact{
				{
					ArtifactID:  "art-123",
					Name:        "test artifact",
					Description: "test description",
					Parts: []arkv1alpha1.A2ATaskPart{
						{Kind: PartKindText, Text: "content1"},
						{Kind: PartKindText, Text: "content2"},
					},
					Metadata: map[string]string{
						"key1": "value1",
					},
				},
			},
		},
		{
			name: "artifact without optional fields",
			artifacts: []protocol.Artifact{
				{
					ArtifactID: "art-456",
					Parts: []protocol.Part{
						protocol.TextPart{Text: "simple content"},
					},
				},
			},
			expected: []arkv1alpha1.A2ATaskArtifact{
				{
					ArtifactID: "art-456",
					Parts: []arkv1alpha1.A2ATaskPart{
						{Kind: PartKindText, Text: "simple content"},
					},
					Metadata: map[string]string{},
				},
			},
		},
		{
			name: "artifact with no parts is filtered out",
			artifacts: []protocol.Artifact{
				{
					ArtifactID: "empty-art",
					Parts:      []protocol.Part{},
				},
			},
			expected: []arkv1alpha1.A2ATaskArtifact{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertArtifactsFromProtocol(tt.artifacts)
			if len(result) != len(tt.expected) {
				t.Errorf("got %d artifacts, want %d", len(result), len(tt.expected))
				return
			}
			for i := range result {
				if result[i].ArtifactID != tt.expected[i].ArtifactID {
					t.Errorf("ArtifactID[%d] = %q, want %q", i, result[i].ArtifactID, tt.expected[i].ArtifactID)
				}
				if result[i].Name != tt.expected[i].Name {
					t.Errorf("Name[%d] = %q, want %q", i, result[i].Name, tt.expected[i].Name)
				}
				if len(result[i].Parts) != len(tt.expected[i].Parts) {
					t.Errorf("Parts[%d] length = %d, want %d", i, len(result[i].Parts), len(tt.expected[i].Parts))
				}
			}
		})
	}
}

func TestConvertHistoryFromProtocol(t *testing.T) {
	tests := []struct {
		name     string
		history  []protocol.Message
		expected []arkv1alpha1.A2ATaskMessage
	}{
		{
			name:     "empty history",
			history:  []protocol.Message{},
			expected: []arkv1alpha1.A2ATaskMessage{},
		},
		{
			name: "message with parts",
			history: []protocol.Message{
				{
					MessageID: "msg-123",
					Role:      protocol.MessageRoleUser,
					Parts: []protocol.Part{
						protocol.TextPart{Text: "hello"},
					},
					Metadata: map[string]any{
						"source": "user",
					},
				},
			},
			expected: []arkv1alpha1.A2ATaskMessage{
				{
					MessageID: "msg-123",
					Role:      string(protocol.MessageRoleUser),
					Parts: []arkv1alpha1.A2ATaskPart{
						{Kind: PartKindText, Text: "hello"},
					},
					Metadata: map[string]string{
						"source": "user",
					},
				},
			},
		},
		{
			name: "message with no parts is filtered out",
			history: []protocol.Message{
				{
					MessageID: "empty-msg",
					Role:      protocol.MessageRoleUser,
					Parts:     []protocol.Part{},
				},
			},
			expected: []arkv1alpha1.A2ATaskMessage{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertHistoryFromProtocol(tt.history)
			if len(result) != len(tt.expected) {
				t.Errorf("got %d messages, want %d", len(result), len(tt.expected))
				return
			}
			for i := range result {
				if result[i].MessageID != tt.expected[i].MessageID {
					t.Errorf("MessageID[%d] = %q, want %q", i, result[i].MessageID, tt.expected[i].MessageID)
				}
				if result[i].Role != tt.expected[i].Role {
					t.Errorf("Role[%d] = %q, want %q", i, result[i].Role, tt.expected[i].Role)
				}
			}
		})
	}
}

// High complexity due to comprehensive test case coverage
//
//nolint:gocognit
func TestConvertStatusMessageFromProtocol(t *testing.T) {
	tests := []struct {
		name            string
		statusMessage   *protocol.Message
		expectedMessage *arkv1alpha1.A2ATaskMessage
		expectedParts   int
	}{
		{
			name:            "nil status message",
			statusMessage:   nil,
			expectedMessage: nil,
			expectedParts:   0,
		},
		{
			name: "status message with parts",
			statusMessage: &protocol.Message{
				MessageID: "status-123",
				Role:      protocol.MessageRoleAgent,
				Parts: []protocol.Part{
					protocol.TextPart{Text: "task completed"},
				},
				Metadata: map[string]any{
					"status": "done",
				},
			},
			expectedMessage: &arkv1alpha1.A2ATaskMessage{
				MessageID: "status-123",
				Role:      string(protocol.MessageRoleAgent),
				Metadata: map[string]string{
					"status": "done",
				},
			},
			expectedParts: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			message, parts := convertStatusMessageFromProtocol(tt.statusMessage)
			if tt.expectedMessage == nil {
				if message != nil {
					t.Errorf("expected nil message, got %v", message)
				}
				if len(parts) != 0 {
					t.Errorf("expected 0 parts, got %d", len(parts))
				}
				return
			}
			if message.MessageID != tt.expectedMessage.MessageID {
				t.Errorf("MessageID = %q, want %q", message.MessageID, tt.expectedMessage.MessageID)
			}
			if message.Role != tt.expectedMessage.Role {
				t.Errorf("Role = %q, want %q", message.Role, tt.expectedMessage.Role)
			}
			if len(parts) != tt.expectedParts {
				t.Errorf("got %d parts, want %d", len(parts), tt.expectedParts)
			}
		})
	}
}

func TestConvertMetadataToStringMap(t *testing.T) {
	tests := []struct {
		name     string
		metadata map[string]any
		expected map[string]string
	}{
		{
			name:     "empty metadata",
			metadata: map[string]any{},
			expected: map[string]string{},
		},
		{
			name: "string values",
			metadata: map[string]any{
				"key1": "value1",
				"key2": "value2",
			},
			expected: map[string]string{
				"key1": "value1",
				"key2": "value2",
			},
		},
		{
			name: "mixed type values converted to strings",
			metadata: map[string]any{
				"string": "text",
				"number": 42,
				"bool":   true,
			},
			expected: map[string]string{
				"string": "text",
				"number": "42",
				"bool":   "true",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertMetadataToStringMap(tt.metadata)
			if len(result) != len(tt.expected) {
				t.Errorf("got %d entries, want %d", len(result), len(tt.expected))
				return
			}
			for k, v := range tt.expected {
				if result[k] != v {
					t.Errorf("result[%q] = %q, want %q", k, result[k], v)
				}
			}
		})
	}
}

func TestPopulateA2ATaskStatusFromProtocol(t *testing.T) {
	tests := []struct {
		name     string
		task     *protocol.Task
		validate func(t *testing.T, status *arkv1alpha1.A2ATaskStatus)
	}{
		{
			name: "basic task population",
			task: &protocol.Task{
				ID:        "task-123",
				ContextID: "ctx-456",
				Status: protocol.TaskStatus{
					State:     "working",
					Timestamp: "2025-01-15T10:00:00Z",
					Message: &protocol.Message{
						MessageID: "msg-789",
						Role:      protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "processing"},
						},
					},
				},
				History: []protocol.Message{
					{
						MessageID: "msg-001",
						Role:      protocol.MessageRoleUser,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "initial request"},
						},
					},
				},
				Artifacts: []protocol.Artifact{
					{
						ArtifactID: "art-001",
						Parts: []protocol.Part{
							protocol.TextPart{Text: "result"},
						},
					},
				},
				Metadata: map[string]any{
					"agent": "test-agent",
				},
			},
			validate: func(t *testing.T, status *arkv1alpha1.A2ATaskStatus) {
				if status.ProtocolState != "working" {
					t.Errorf("ProtocolState = %q, want %q", status.ProtocolState, "working")
				}
				if status.ContextID != "ctx-456" {
					t.Errorf("ContextID = %q, want %q", status.ContextID, "ctx-456")
				}
				if len(status.History) != 2 {
					t.Errorf("History length = %d, want 2 (original + status message)", len(status.History))
				}
				if len(status.Artifacts) != 1 {
					t.Errorf("Artifacts length = %d, want 1", len(status.Artifacts))
				}
				if status.ProtocolMetadata["agent"] != "test-agent" {
					t.Errorf("ProtocolMetadata[agent] = %q, want %q", status.ProtocolMetadata["agent"], "test-agent")
				}
				if status.LastStatusMessage == nil {
					t.Error("LastStatusMessage should not be nil")
				}
				if status.LastStatusTimestamp != "2025-01-15T10:00:00Z" {
					t.Errorf("LastStatusTimestamp = %q, want %q", status.LastStatusTimestamp, "2025-01-15T10:00:00Z")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := &arkv1alpha1.A2ATaskStatus{}
			PopulateA2ATaskStatusFromProtocol(status, tt.task)
			tt.validate(t, status)
		})
	}
}

// High complexity due to comprehensive test case coverage
//
//nolint:gocognit
func TestMergeArtifacts(t *testing.T) {
	tests := []struct {
		name           string
		existingStatus *arkv1alpha1.A2ATaskStatus
		newStatus      *arkv1alpha1.A2ATaskStatus
		expectedCount  int
		expectedIDs    []string
	}{
		{
			name: "merge new artifacts",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				Artifacts: []arkv1alpha1.A2ATaskArtifact{
					{ArtifactID: "art-1"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				Artifacts: []arkv1alpha1.A2ATaskArtifact{
					{ArtifactID: "art-2"},
					{ArtifactID: "art-3"},
				},
			},
			expectedCount: 3,
			expectedIDs:   []string{"art-1", "art-2", "art-3"},
		},
		{
			name: "avoid duplicate artifacts",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				Artifacts: []arkv1alpha1.A2ATaskArtifact{
					{ArtifactID: "art-1"},
					{ArtifactID: "art-2"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				Artifacts: []arkv1alpha1.A2ATaskArtifact{
					{ArtifactID: "art-2"},
					{ArtifactID: "art-3"},
				},
			},
			expectedCount: 3,
			expectedIDs:   []string{"art-1", "art-2", "art-3"},
		},
		{
			name: "empty new artifacts",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				Artifacts: []arkv1alpha1.A2ATaskArtifact{
					{ArtifactID: "art-1"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				Artifacts: []arkv1alpha1.A2ATaskArtifact{},
			},
			expectedCount: 1,
			expectedIDs:   []string{"art-1"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			MergeArtifacts(tt.existingStatus, tt.newStatus)
			if len(tt.existingStatus.Artifacts) != tt.expectedCount {
				t.Errorf("got %d artifacts, want %d", len(tt.existingStatus.Artifacts), tt.expectedCount)
			}
			ids := make([]string, len(tt.existingStatus.Artifacts))
			for i, art := range tt.existingStatus.Artifacts {
				ids[i] = art.ArtifactID
			}
			for _, expectedID := range tt.expectedIDs {
				found := false
				for _, id := range ids {
					if id == expectedID {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("expected artifact ID %q not found", expectedID)
				}
			}
		})
	}
}

// High complexity due to comprehensive test case coverage
//
//nolint:gocognit
func TestMergeHistory(t *testing.T) {
	tests := []struct {
		name           string
		existingStatus *arkv1alpha1.A2ATaskStatus
		newStatus      *arkv1alpha1.A2ATaskStatus
		expectedCount  int
		expectedIDs    []string
	}{
		{
			name: "merge new messages",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: "msg-1"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: "msg-2"},
					{MessageID: "msg-3"},
				},
			},
			expectedCount: 3,
			expectedIDs:   []string{"msg-1", "msg-2", "msg-3"},
		},
		{
			name: "avoid duplicate messages",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: "msg-1"},
					{MessageID: "msg-2"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: "msg-2"},
					{MessageID: "msg-3"},
				},
			},
			expectedCount: 3,
			expectedIDs:   []string{"msg-1", "msg-2", "msg-3"},
		},
		{
			name: "empty new history does nothing",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: "msg-1"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{},
			},
			expectedCount: 1,
			expectedIDs:   []string{"msg-1"},
		},
		{
			name: "messages without IDs are skipped",
			existingStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: "msg-1"},
				},
			},
			newStatus: &arkv1alpha1.A2ATaskStatus{
				History: []arkv1alpha1.A2ATaskMessage{
					{MessageID: ""},
					{MessageID: "msg-2"},
				},
			},
			expectedCount: 2,
			expectedIDs:   []string{"msg-1", "msg-2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			MergeHistory(tt.existingStatus, tt.newStatus)
			if len(tt.existingStatus.History) != tt.expectedCount {
				t.Errorf("got %d messages, want %d", len(tt.existingStatus.History), tt.expectedCount)
			}
			ids := make([]string, 0)
			for _, msg := range tt.existingStatus.History {
				if msg.MessageID != "" {
					ids = append(ids, msg.MessageID)
				}
			}
			for _, expectedID := range tt.expectedIDs {
				found := false
				for _, id := range ids {
					if id == expectedID {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("expected message ID %q not found", expectedID)
				}
			}
		})
	}
}

func TestParseProtocolTimestamp(t *testing.T) {
	tests := []struct {
		name      string
		timestamp string
		expectNil bool
	}{
		{
			name:      "valid RFC3339 timestamp",
			timestamp: "2025-01-15T10:30:45Z",
			expectNil: false,
		},
		{
			name:      "empty timestamp returns nil",
			timestamp: "",
			expectNil: true,
		},
		{
			name:      "invalid timestamp returns nil",
			timestamp: "not-a-timestamp",
			expectNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseProtocolTimestamp(tt.timestamp)
			if tt.expectNil {
				if result != nil {
					t.Errorf("expected nil, got %v", result)
				}
			} else {
				if result == nil {
					t.Error("expected non-nil result")
				}
			}
		})
	}
}

func TestSetTaskTimestamps(t *testing.T) {
	tests := []struct {
		name            string
		oldPhase        string
		task            *protocol.Task
		validateStarted bool
		validateEnded   bool
	}{
		{
			name:     "sets start time when transitioning from pending",
			oldPhase: PhasePending,
			task: &protocol.Task{
				Status: protocol.TaskStatus{
					State:     "working",
					Timestamp: "2025-01-15T10:00:00Z",
				},
			},
			validateStarted: true,
			validateEnded:   false,
		},
		{
			name:     "sets completion time when reaching terminal state",
			oldPhase: PhaseRunning,
			task: &protocol.Task{
				Status: protocol.TaskStatus{
					State:     "completed",
					Timestamp: "2025-01-15T11:00:00Z",
				},
			},
			validateStarted: false,
			validateEnded:   true,
		},
		{
			name:     "does not set start time if already started",
			oldPhase: PhaseRunning,
			task: &protocol.Task{
				Status: protocol.TaskStatus{
					State:     "working",
					Timestamp: "2025-01-15T10:30:00Z",
				},
			},
			validateStarted: false,
			validateEnded:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := &arkv1alpha1.A2ATaskStatus{}
			if !tt.validateStarted && tt.oldPhase == PhaseRunning {
				pastTime := metav1.NewTime(time.Now().Add(-1 * time.Hour))
				status.StartTime = &pastTime
			}
			setTaskTimestamps(status, tt.oldPhase, tt.task)

			if tt.validateStarted {
				if status.StartTime == nil {
					t.Error("StartTime should be set")
				}
			}
			if tt.validateEnded {
				if status.CompletionTime == nil {
					t.Error("CompletionTime should be set")
				}
			}
		})
	}
}

func TestUpdateA2ATaskStatus(t *testing.T) {
	t.Run("updates status with protocol task data", func(t *testing.T) {
		status := &arkv1alpha1.A2ATaskStatus{
			Phase: PhasePending,
		}
		task := &protocol.Task{
			ID:        "task-123",
			ContextID: "ctx-456",
			Status: protocol.TaskStatus{
				State:     "working",
				Timestamp: "2025-01-15T10:00:00Z",
			},
			History: []protocol.Message{
				{
					MessageID: "msg-1",
					Role:      protocol.MessageRoleUser,
					Parts: []protocol.Part{
						protocol.TextPart{Text: "test"},
					},
				},
			},
		}

		UpdateA2ATaskStatus(status, task)

		if status.Phase != PhaseRunning {
			t.Errorf("Phase = %q, want %q", status.Phase, PhaseRunning)
		}
		if status.ContextID != "ctx-456" {
			t.Errorf("ContextID = %q, want %q", status.ContextID, "ctx-456")
		}
		if len(status.History) == 0 {
			t.Error("History should not be empty")
		}
	})

	t.Run("handles nil task gracefully", func(t *testing.T) {
		status := &arkv1alpha1.A2ATaskStatus{
			Phase: PhasePending,
		}
		UpdateA2ATaskStatus(status, nil)
		if status.Phase != PhasePending {
			t.Errorf("Phase should remain unchanged, got %q", status.Phase)
		}
	})
}

func stringPtr(s string) *string {
	return &s
}
