/* Copyright 2025. McKinsey & Company */

package v1prealpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type A2AServerSpec struct {
	// Address specifies how to reach the A2A server
	// +kubebuilder:validation:Required
	Address ValueSource `json:"address"`

	// Headers for authentication and other metadata
	// +kubebuilder:validation:Optional
	Headers []Header `json:"headers,omitempty"`

	// Description of the A2A server
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="1m"
	PollInterval *metav1.Duration `json:"pollInterval,omitempty"`

	// Timeout for A2A agent execution (e.g., "30s", "5m", "1h")
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="5m"
	Timeout string `json:"timeout,omitempty"`
}

type A2AServerStatus struct {
	// LastResolvedAddress contains the last resolved address value
	// +kubebuilder:validation:Optional
	LastResolvedAddress string `json:"lastResolvedAddress,omitempty"`

	// Conditions represent the latest available observations of the A2A server's state
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Ready",type="string",JSONPath=".status.conditions[?(@.type=='Ready')].status",description="Ready status"
// +kubebuilder:printcolumn:name="Discovering",type="string",JSONPath=".status.conditions[?(@.type=='Discovering')].status",description="Discovery status"
// +kubebuilder:printcolumn:name="Address",type="string",JSONPath=".status.lastResolvedAddress",description="Last resolved address"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp",description="Age"
type A2AServer struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   A2AServerSpec   `json:"spec,omitempty"`
	Status A2AServerStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type A2AServerList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []A2AServer `json:"items"`
}

func init() {
	SchemeBuilder.Register(&A2AServer{}, &A2AServerList{})
}
