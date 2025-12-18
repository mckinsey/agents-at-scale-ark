/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// MemorySpec defines the desired state of Memory.
type MemorySpec struct {
	// +kubebuilder:validation:Required
	Address ValueSource `json:"address"`

	// +kubebuilder:validation:Optional
	// Headers contains HTTP headers to include in memory API requests
	Headers []Header `json:"headers,omitempty"`
}

// MemoryStatus defines the observed state of Memory.
type MemoryStatus struct {
	// +kubebuilder:validation:Optional
	// LastResolvedAddress contains the last resolved address value for reference
	LastResolvedAddress *string `json:"lastResolvedAddress,omitempty"`

	// Phase represents the current state of the memory
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=running;ready;error
	Phase string `json:"phase,omitempty"`

	// Message provides additional information about the current status
	// +kubebuilder:validation:Optional
	Message string `json:"message,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type="string",JSONPath=".status.phase",description="Phase of the memory"
// +kubebuilder:printcolumn:name="Address",type="string",JSONPath=".status.lastResolvedAddress",description="Last resolved address"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp",description="Age of the memory"

// Memory is the Schema for the memories API.
type Memory struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   MemorySpec   `json:"spec,omitempty"`
	Status MemoryStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// MemoryList contains a list of Memory.
type MemoryList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Memory `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Memory{}, &MemoryList{})
}
