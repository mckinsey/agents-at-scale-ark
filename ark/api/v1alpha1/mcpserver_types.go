/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type MCPServerSpec struct {
	// +kubebuilder:validation:Required
	Address ValueSource `json:"address"`
	// +kubebuilder:validation:Optional
	Headers []Header `json:"headers,omitempty"`
	// Timeout specifies the maximum duration for MCP tool calls to this server.
	// Use this to support long-running operations (e.g., "5m", "10m", "30m").
	// Defaults to "30s" if not specified.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="30s"
	Timeout string `json:"timeout,omitempty"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=http;sse
	// +kubebuilder:default="http"
	Transport string `json:"transport,omitempty"`
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="1m"
	PollInterval *metav1.Duration `json:"pollInterval,omitempty"`
}

// MCPServerStatus defines the observed state of MCPServer
type MCPServerStatus struct {
	// +kubebuilder:validation:Optional
	// ResolvedAddress contains the actual resolved address value
	ResolvedAddress string `json:"resolvedAddress,omitempty"`

	// ToolCount represents the number of tools discovered from this MCP server
	// +kubebuilder:validation:Optional
	ToolCount int `json:"toolCount,omitempty"`

	// Conditions represent the latest available observations of the MCP server's state
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Available",type="string",JSONPath=".status.conditions[?(@.type=='Available')].status"
// +kubebuilder:printcolumn:name="Discovering",type="string",JSONPath=".status.conditions[?(@.type=='Discovering')].status",description="Discovery status"
// +kubebuilder:printcolumn:name="Tools",type="integer",JSONPath=".status.toolCount",description="Number of tools"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp",description="Age"
type MCPServer struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   MCPServerSpec   `json:"spec,omitempty"`
	Status MCPServerStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type MCPServerList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []MCPServer `json:"items"`
}

func init() {
	SchemeBuilder.Register(&MCPServer{}, &MCPServerList{})
}
