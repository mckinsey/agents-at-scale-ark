/* Copyright 2025. McKinsey & Company */

package genai

import (
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

const (
	PhasePending       = "pending"
	PhaseAssigned      = "assigned"
	PhaseRunning       = "running"
	PhaseInputRequired = "input-required"
	PhaseAuthRequired  = "auth-required"
	PhaseCompleted     = "completed"
	PhaseFailed        = "failed"
	PhaseCancelled     = "cancelled"
	PhaseUnknown       = "unknown"
)

const (
	PartKindText = "text"
	PartKindData = "data"
	PartKindFile = "file"
)

// ConvertA2AStateToPhase converts A2A protocol task states to Ark K8s A2ATask phases
func ConvertA2AStateToPhase(state string) string {
	switch state {
	case "submitted":
		return PhaseAssigned
	case "working":
		return PhaseRunning
	case "input-required":
		return PhaseInputRequired
	case "auth-required":
		return PhaseAuthRequired
	case "completed":
		return PhaseCompleted
	case "failed":
		return PhaseFailed
	case "canceled":
		return PhaseCancelled
	case "rejected":
		return PhaseFailed
	default:
		return PhaseUnknown
	}
}

// IsTerminalPhase returns true if the phase represents a terminal state
func IsTerminalPhase(phase string) bool {
	return phase == PhaseCompleted || phase == PhaseFailed || phase == PhaseCancelled
}

func convertPartFromProtocol(part interface{}) arkv1alpha1.A2ATaskPart {
	switch p := part.(type) {
	case *protocol.TextPart:
		return arkv1alpha1.A2ATaskPart{
			Kind: PartKindText,
			Text: p.Text,
		}
	case *protocol.DataPart:
		return arkv1alpha1.A2ATaskPart{
			Kind: PartKindData,
			Data: fmt.Sprintf("%v", p.Data),
		}
	case *protocol.FilePart:
		taskPart := arkv1alpha1.A2ATaskPart{
			Kind: PartKindFile,
		}
		if fileWithURI, ok := p.File.(*protocol.FileWithURI); ok {
			taskPart.URI = fileWithURI.URI
			if fileWithURI.MimeType != nil {
				taskPart.MimeType = *fileWithURI.MimeType
			}
		}
		if fileWithBytes, ok := p.File.(*protocol.FileWithBytes); ok {
			taskPart.Data = fileWithBytes.Bytes
			if fileWithBytes.MimeType != nil {
				taskPart.MimeType = *fileWithBytes.MimeType
			}
		}
		return taskPart
	default:
		return arkv1alpha1.A2ATaskPart{
			Kind: PartKindText,
			Text: "unknown part type",
		}
	}
}

func convertArtifactsFromProtocol(protocolArtifacts []protocol.Artifact) []arkv1alpha1.A2ATaskArtifact {
	artifacts := make([]arkv1alpha1.A2ATaskArtifact, 0, len(protocolArtifacts))
	for _, artifact := range protocolArtifacts {
		var parts []arkv1alpha1.A2ATaskPart
		for _, part := range artifact.Parts {
			parts = append(parts, convertPartFromProtocol(part))
		}

		metadata := convertMetadataToStringMap(artifact.Metadata)

		if len(parts) > 0 {
			taskArtifact := arkv1alpha1.A2ATaskArtifact{
				ArtifactID: artifact.ArtifactID,
				Parts:      parts,
				Metadata:   metadata,
			}
			if artifact.Name != nil {
				taskArtifact.Name = *artifact.Name
			}
			if artifact.Description != nil {
				taskArtifact.Description = *artifact.Description
			}
			artifacts = append(artifacts, taskArtifact)
		}
	}
	return artifacts
}

func convertHistoryFromProtocol(protocolHistory []protocol.Message) []arkv1alpha1.A2ATaskMessage {
	history := make([]arkv1alpha1.A2ATaskMessage, 0, len(protocolHistory))
	for _, msg := range protocolHistory {
		var msgParts []arkv1alpha1.A2ATaskPart
		for _, part := range msg.Parts {
			msgParts = append(msgParts, convertPartFromProtocol(part))
		}

		msgMetadata := convertMetadataToStringMap(msg.Metadata)

		if len(msgParts) > 0 {
			historyMessage := arkv1alpha1.A2ATaskMessage{
				MessageID: msg.MessageID,
				Role:      string(msg.Role),
				Parts:     msgParts,
				Metadata:  msgMetadata,
			}
			history = append(history, historyMessage)
		}
	}
	return history
}

func convertStatusMessageFromProtocol(statusMessage *protocol.Message) (*arkv1alpha1.A2ATaskMessage, []arkv1alpha1.A2ATaskPart) {
	if statusMessage == nil {
		return nil, nil
	}

	msgParts := make([]arkv1alpha1.A2ATaskPart, 0, len(statusMessage.Parts))
	for _, part := range statusMessage.Parts {
		msgParts = append(msgParts, convertPartFromProtocol(part))
	}

	msgMetadata := convertMetadataToStringMap(statusMessage.Metadata)

	message := &arkv1alpha1.A2ATaskMessage{
		MessageID: statusMessage.MessageID,
		Role:      string(statusMessage.Role),
		Parts:     msgParts,
		Metadata:  msgMetadata,
	}

	return message, msgParts
}

func convertMetadataToStringMap(metadata map[string]any) map[string]string {
	result := make(map[string]string)
	for k, v := range metadata {
		result[k] = fmt.Sprintf("%v", v)
	}
	return result
}

// PopulateA2ATaskStatusFromProtocol populates A2ATaskStatus fields from a protocol.Task
func PopulateA2ATaskStatusFromProtocol(status *arkv1alpha1.A2ATaskStatus, task *protocol.Task) {
	artifacts := convertArtifactsFromProtocol(task.Artifacts)
	history := convertHistoryFromProtocol(task.History)
	taskMetadata := convertMetadataToStringMap(task.Metadata)

	message, msgParts := convertStatusMessageFromProtocol(task.Status.Message)
	if len(msgParts) > 0 {
		history = append(history, *message)
	}

	status.ProtocolState = string(task.Status.State)
	status.ContextID = task.ContextID
	status.Artifacts = artifacts
	status.History = history
	status.ProtocolMetadata = taskMetadata
	status.LastStatusMessage = message
	status.LastStatusTimestamp = task.Status.Timestamp
}

// MergeArtifacts merges new artifacts into existing status, avoiding duplicates by ArtifactID
func MergeArtifacts(existingStatus, newStatus *arkv1alpha1.A2ATaskStatus) {
	existingArtifactIds := make(map[string]bool)
	for _, artifact := range existingStatus.Artifacts {
		existingArtifactIds[artifact.ArtifactID] = true
	}

	for _, newArtifact := range newStatus.Artifacts {
		if !existingArtifactIds[newArtifact.ArtifactID] {
			existingStatus.Artifacts = append(existingStatus.Artifacts, newArtifact)
		}
	}
}

// MergeHistory merges new messages into existing history, avoiding duplicates by MessageID
func MergeHistory(existingStatus, newStatus *arkv1alpha1.A2ATaskStatus) {
	if len(newStatus.History) == 0 {
		return
	}

	existingMessageIds := make(map[string]bool)
	for _, existingMsg := range existingStatus.History {
		if existingMsg.MessageID != "" {
			existingMessageIds[existingMsg.MessageID] = true
		}
	}

	for _, newMsg := range newStatus.History {
		if newMsg.MessageID != "" && !existingMessageIds[newMsg.MessageID] {
			existingStatus.History = append(existingStatus.History, newMsg)
			existingMessageIds[newMsg.MessageID] = true
		}
	}
}

// UpdateA2ATaskStatus updates the A2ATask status with information from the A2A server
func UpdateA2ATaskStatus(a2aTaskStatus *arkv1alpha1.A2ATaskStatus, task *protocol.Task) {
	if task == nil {
		return
	}

	oldPhase := a2aTaskStatus.Phase
	newTaskData := arkv1alpha1.A2ATaskStatus{}
	PopulateA2ATaskStatusFromProtocol(&newTaskData, task)

	if len(a2aTaskStatus.History) == 0 && len(a2aTaskStatus.Artifacts) == 0 {
		PopulateA2ATaskStatusFromProtocol(a2aTaskStatus, task)
		setTaskTimestamps(a2aTaskStatus, oldPhase, task)
		return
	}

	MergeArtifacts(a2aTaskStatus, &newTaskData)
	MergeHistory(a2aTaskStatus, &newTaskData)

	a2aTaskStatus.ProtocolState = newTaskData.ProtocolState
	a2aTaskStatus.ProtocolMetadata = newTaskData.ProtocolMetadata
	a2aTaskStatus.ContextID = newTaskData.ContextID
	a2aTaskStatus.LastStatusMessage = newTaskData.LastStatusMessage
	a2aTaskStatus.LastStatusTimestamp = newTaskData.LastStatusTimestamp

	setTaskTimestamps(a2aTaskStatus, oldPhase, task)
}

func setTaskTimestamps(status *arkv1alpha1.A2ATaskStatus, oldPhase string, task *protocol.Task) {
	newPhase := ConvertA2AStateToPhase(string(task.Status.State))
	status.Phase = newPhase

	// Set StartTime from protocol timestamp when task first starts execution
	if oldPhase == PhasePending && status.StartTime == nil {
		if timestamp := parseProtocolTimestamp(task.Status.Timestamp); timestamp != nil {
			status.StartTime = timestamp
		}
	}

	// Set CompletionTime from protocol timestamp when reaching terminal state
	if !IsTerminalPhase(oldPhase) && IsTerminalPhase(newPhase) {
		if timestamp := parseProtocolTimestamp(task.Status.Timestamp); timestamp != nil {
			status.CompletionTime = timestamp
		}
	}
}

func parseProtocolTimestamp(rfc3339Timestamp string) *metav1.Time {
	if rfc3339Timestamp == "" {
		return nil
	}
	parsedTime, err := time.Parse(time.RFC3339, rfc3339Timestamp)
	if err != nil {
		return nil
	}
	timestamp := metav1.NewTime(parsedTime)
	return &timestamp
}
