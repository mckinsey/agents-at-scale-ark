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

	// EndpointResolution controls which URL Ark calls for A2A requests.
	// "address" uses spec.address unchanged. "cardPath" keeps the scheme, host
	// and port from spec.address and takes only the path from the agent card.
	// "cardUrl" uses the agent card URL as written, which requires the card
	// host to match spec.address or be listed in allowedEndpointHosts.
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=address;cardPath;cardUrl
	// +kubebuilder:default="address"
	EndpointResolution string `json:"endpointResolution,omitempty"`

	// AllowedEndpointHosts lists hosts the agent card may redirect requests to
	// when endpointResolution is "cardUrl". The host of spec.address is always
	// allowed. Entries are hostnames, optionally prefixed with "*." to match
	// one level of subdomain.
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:items:MaxLength=253
	// +kubebuilder:validation:items:Pattern=`^(\*\.)?[a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?)*$`
	AllowedEndpointHosts []string `json:"allowedEndpointHosts,omitempty"`
}

type A2AServerStatus struct {
	// LastResolvedAddress contains the last resolved address value
	// +kubebuilder:validation:Optional
	LastResolvedAddress string `json:"lastResolvedAddress,omitempty"`

	// LastResolvedEndpoint is the URL Ark sends A2A requests to. It equals
	// LastResolvedAddress unless spec.endpointResolution selects the agent
	// card URL and that URL is accepted.
	// +kubebuilder:validation:Optional
	LastResolvedEndpoint string `json:"lastResolvedEndpoint,omitempty"`

	// RejectedEndpoint records an agent card URL that was not accepted, so the
	// requests continue to go to LastResolvedAddress.
	// +kubebuilder:validation:Optional
	RejectedEndpoint string `json:"rejectedEndpoint,omitempty"`

	// Conditions represent the latest available observations of the A2A server's state
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Ready",type="string",JSONPath=".status.conditions[?(@.type=='Ready')].status",description="Ready status"
// +kubebuilder:printcolumn:name="Discovering",type="string",JSONPath=".status.conditions[?(@.type=='Discovering')].status",description="Discovery status"
// +kubebuilder:printcolumn:name="Address",type="string",JSONPath=".status.lastResolvedAddress",description="Last resolved address"
// +kubebuilder:printcolumn:name="Endpoint",type="string",JSONPath=".status.lastResolvedEndpoint",description="Endpoint used for A2A requests"
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
