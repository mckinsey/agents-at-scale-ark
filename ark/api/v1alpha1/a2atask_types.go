/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type A2ATaskConditionType string

// A2ATask condition types
const (
	// A2ATaskCompleted indicates the task is no longer running (regardless of outcome).
	// Status=True means the task has finished and no more changes will occur.
	// Status=False means the task is still in progress.
	A2ATaskCompleted A2ATaskConditionType = "Completed"
)

// AgentRef references an Agent resource by name and namespace.
// Used to track which agent was assigned to execute an A2A task.
type AgentRef struct {
	// Name of the Agent resource.
	// +kubebuilder:validation:Optional
	Name string `json:"name,omitempty"`
	// Namespace where the Agent resource is located.
	// If empty, defaults to the same namespace as the A2ATask.
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

// A2AServerRef references an A2AServer resource by name and namespace.
// Used to identify which A2A server to poll for task status updates.
type A2AServerRef struct {
	// Name of the A2AServer resource.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// Namespace where the A2AServer resource is located.
	// If empty, defaults to the same namespace as the A2ATask.
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

// A2ATaskPart represents content parts compatible with A2A protocol.
// Parts can contain text, binary data, or file references.
type A2ATaskPart struct {
	// Kind specifies the type of content: "text", "file", or "data".
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=text;file;data
	Kind string `json:"kind"`
	// Text contains the actual text content when Kind is "text".
	// +kubebuilder:validation:Optional
	Text string `json:"text,omitempty"`
	// Data contains base64-encoded binary content when Kind is "data".
	// +kubebuilder:validation:Optional
	Data string `json:"data,omitempty"`
	// MimeType specifies the content type (e.g., "text/plain", "application/json").
	// +kubebuilder:validation:Optional
	MimeType string `json:"mimeType,omitempty"`
	// URI references an external resource when Kind is "file".
	// +kubebuilder:validation:Optional
	URI string `json:"uri,omitempty"`
	// Metadata contains additional key-value pairs for this part.
	// +kubebuilder:validation:Optional
	Metadata map[string]string `json:"metadata,omitempty"`
}

// A2ATaskArtifact represents artifacts produced during A2A task execution.
// Artifacts contain structured content with one or more parts.
type A2ATaskArtifact struct {
	// ArtifactID uniquely identifies this artifact within the task.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	ArtifactID string `json:"artifactId"`
	// Name is a human-readable name for the artifact.
	// +kubebuilder:validation:Optional
	Name string `json:"name,omitempty"`
	// Description provides additional context about the artifact.
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`
	// Parts contains the content of the artifact as one or more parts.
	// +kubebuilder:validation:Required
	Parts []A2ATaskPart `json:"parts"`
	// Metadata contains additional key-value pairs for this artifact.
	// +kubebuilder:validation:Optional
	Metadata map[string]string `json:"metadata,omitempty"`
}

// A2ATaskMessage represents messages exchanged during A2A task execution.
// Messages form the conversation history between user, agent, and system.
type A2ATaskMessage struct {
	// MessageID is the unique identifier for this message from the A2A protocol.
	// +kubebuilder:validation:Optional
	MessageID string `json:"messageId,omitempty"`
	// Role identifies the message sender: "user", "agent", or "system".
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=user;agent;system
	Role string `json:"role"`
	// Parts contains the message content as one or more parts.
	// +kubebuilder:validation:Required
	Parts []A2ATaskPart `json:"parts"`
	// Metadata contains additional key-value pairs for this message.
	// +kubebuilder:validation:Optional
	Metadata map[string]string `json:"metadata,omitempty"`
}

// A2ATaskSpec defines the desired state of an A2ATask.
// Links the task to its originating query and captures task parameters.
type A2ATaskSpec struct {
	// QueryRef references the Query that created this A2A task.
	// +kubebuilder:validation:Required
	QueryRef QueryRef `json:"queryRef"`
	// A2AServerRef references the A2AServer to poll for task status updates.
	// +kubebuilder:validation:Required
	A2AServerRef A2AServerRef `json:"a2aServerRef"`
	// AgentRef references the agent executing this task.
	// +kubebuilder:validation:Required
	AgentRef AgentRef `json:"agentRef"`
	// TaskID is the unique identifier from the A2A protocol.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	TaskID string `json:"taskId"`
	// ContextID links this task to an A2A conversation context for stateful interactions.
	// +kubebuilder:validation:Optional
	ContextID string `json:"contextId,omitempty"`
	// Input contains the user's input that initiated this task.
	// +kubebuilder:validation:Optional
	Input string `json:"input,omitempty"`
	// Parameters contains additional key-value parameters for task execution.
	// +kubebuilder:validation:Optional
	Parameters map[string]string `json:"parameters,omitempty"`
	// Priority determines task execution order (higher values execute first).
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=0
	Priority int32 `json:"priority,omitempty"`
	// Timeout specifies how long we will poll the A2A server for task completion before timing out.
	// If the task has not reached a terminal state (completed, failed, cancelled) within this duration,
	// it will be marked as failed.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="12h"
	Timeout *metav1.Duration `json:"timeout,omitempty"`
	// TTL (time to live) specifies how long to keep this A2ATask resource in the system after completion.
	// After this duration, the resource may be automatically deleted.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="720h"
	TTL *metav1.Duration `json:"ttl,omitempty"`
	// PollInterval specifies how frequently to check the A2A server for task status updates.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="5s"
	PollInterval *metav1.Duration `json:"pollInterval,omitempty"`
}

// A2ATaskStatus defines the observed state of an A2ATask.
// Combines Kubernetes lifecycle tracking with A2A protocol task data.
type A2ATaskStatus struct {
	// Phase indicates the current Kubernetes lifecycle stage of the task.
	// Possible values: pending, assigned, running, input-required, auth-required, completed, failed, cancelled, unknown.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="pending"
	// +kubebuilder:validation:Enum=pending;assigned;running;input-required;auth-required;completed;failed;cancelled;unknown
	Phase string `json:"phase,omitempty"`
	// Conditions represent the latest available observations of the task's state.
	// The Completed condition indicates whether the task is no longer running.
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty" patchStrategy:"merge" patchMergeKey:"type"`
	// StartTime records when task execution began.
	// +kubebuilder:validation:Optional
	StartTime *metav1.Time `json:"startTime,omitempty"`
	// CompletionTime records when task execution finished (success or failure).
	// +kubebuilder:validation:Optional
	CompletionTime *metav1.Time `json:"completionTime,omitempty"`
	// Error contains the error message if the task failed.
	// +kubebuilder:validation:Optional
	Error string `json:"error,omitempty"`

	// A2A Protocol fields (flattened from protocol.Task)
	// ProtocolState indicates the current state in the A2A protocol.
	// Possible values: submitted, working, input-required, completed, canceled, failed, rejected, auth-required, unknown.
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=submitted;working;input-required;completed;canceled;failed;rejected;auth-required;unknown
	ProtocolState string `json:"protocolState,omitempty"`
	// ContextID links this task to a specific A2A conversation context.
	// +kubebuilder:validation:Optional
	ContextID string `json:"contextId,omitempty"`
	// Artifacts contains outputs produced by the A2A task execution.
	// +kubebuilder:validation:Optional
	Artifacts []A2ATaskArtifact `json:"artifacts,omitempty"`
	// History contains the complete conversation from the A2A protocol.
	// +kubebuilder:validation:Optional
	History []A2ATaskMessage `json:"history,omitempty"`
	// ProtocolMetadata contains additional key-value pairs from the A2A protocol.
	// +kubebuilder:validation:Optional
	ProtocolMetadata map[string]string `json:"protocolMetadata,omitempty"`
	// LastStatusMessage contains the most recent status message from the A2A protocol.
	// +kubebuilder:validation:Optional
	LastStatusMessage *A2ATaskMessage `json:"lastStatusMessage,omitempty"`
	// LastStatusTimestamp records when the protocol status was last updated (RFC3339 format).
	// +kubebuilder:validation:Optional
	LastStatusTimestamp string `json:"lastStatusTimestamp,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Query",type=string,JSONPath=`.spec.queryRef.name`
// +kubebuilder:printcolumn:name="Agent",type=string,JSONPath=`.spec.agentRef.name`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

type A2ATask struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   A2ATaskSpec   `json:"spec,omitempty"`
	Status A2ATaskStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type A2ATaskList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []A2ATask `json:"items"`
}

func init() {
	SchemeBuilder.Register(&A2ATask{}, &A2ATaskList{})
}
