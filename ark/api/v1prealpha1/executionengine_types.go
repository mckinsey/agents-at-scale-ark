/* Copyright 2025. McKinsey & Company */

package v1prealpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ExecutionEngineSpec defines the configuration for an execution engine that can run agent workloads.
// This allows agents to be executed by different frameworks such as LangChain, AutoGen, or other
// agent execution systems, rather than the built-in OpenAI-compatible engine.
// Execution engines work as operators that watch Query CRDs and process queries for agents
// that reference them.
type ExecutionEngineSpec struct {
	// Type specifies which execution engine implementation to use
	// +kubebuilder:validation:Required
	Type string `json:"type"`

	// Address specifies how to reach the execution engine
	// +kubebuilder:validation:Required
	Address ValueSource `json:"address"`

	// Description provides human-readable information about this execution engine
	Description string `json:"description,omitempty"`

	// Timeout specifies the HTTP request timeout for this execution engine (e.g., "5m", "30s", "1h").
	// Defaults to "5m" if not specified.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="5m"
	Timeout string `json:"timeout,omitempty"`

	// Streaming indicates whether this engine supports SSE streaming via /execute-stream
	// +kubebuilder:validation:Optional
	Streaming bool `json:"streaming,omitempty"`
}

type ExecutionEngineStatus struct {
	// +kubebuilder:validation:Optional
	// LastResolvedAddress contains the actual resolved address value
	LastResolvedAddress string `json:"lastResolvedAddress,omitempty"`
	Phase               string `json:"phase,omitempty"`
	Message             string `json:"message,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Address",type=string,JSONPath=`.status.lastResolvedAddress`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

type ExecutionEngine struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ExecutionEngineSpec   `json:"spec,omitempty"`
	Status ExecutionEngineStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type ExecutionEngineList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ExecutionEngine `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ExecutionEngine{}, &ExecutionEngineList{})
}
