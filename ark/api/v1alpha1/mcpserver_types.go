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

// MCPServerAuthorizationStatus surfaces OAuth 2.1 / RFC 9728 Protected
// Resource Metadata discovered from an MCP server that requires
// authorization, per the MCP 2025-06-18 authorization specification.
//
// Populated by the controller when a server responds with HTTP 401 and a
// parseable WWW-Authenticate header. Read-only — consumers (dashboard,
// future ark-api OAuth flow) use this as a stable contract.
type MCPServerAuthorizationStatus struct {
	// Required is true when the server has responded with HTTP 401 plus a
	// WWW-Authenticate: Bearer challenge, indicating OAuth authorization
	// is needed before tool discovery can proceed.
	// +kubebuilder:validation:Optional
	Required bool `json:"required,omitempty"`

	// Resource is the canonical URI of the protected MCP resource, taken
	// from the `resource` field of the RFC 9728 Protected Resource
	// Metadata document.
	// +kubebuilder:validation:Optional
	Resource string `json:"resource,omitempty"`

	// ResourceMetadataURL is the `resource_metadata` URL parsed from the
	// server's WWW-Authenticate header (RFC 9728 §5.1).
	// +kubebuilder:validation:Optional
	ResourceMetadataURL string `json:"resourceMetadataURL,omitempty"`

	// ResourceName is the human-readable name of the protected resource
	// (RFC 9728 `resource_name`), e.g. "Notion MCP (Beta)".
	// +kubebuilder:validation:Optional
	ResourceName string `json:"resourceName,omitempty"`

	// AuthorizationServers is the list of authorization server issuers
	// the MCP resource trusts (RFC 9728 `authorization_servers`).
	// +kubebuilder:validation:Optional
	AuthorizationServers []string `json:"authorizationServers,omitempty"`

	// ScopesSupported is the list of OAuth scopes advertised by the
	// authorization server (RFC 8414 `scopes_supported`).
	// +kubebuilder:validation:Optional
	ScopesSupported []string `json:"scopesSupported,omitempty"`

	// GrantTypesSupported is the set of OAuth grant types the
	// authorization server supports (RFC 8414 `grant_types_supported`).
	// +kubebuilder:validation:Optional
	GrantTypesSupported []string `json:"grantTypesSupported,omitempty"`

	// RegistrationEndpoint is the RFC 7591 dynamic client registration
	// endpoint, when the authorization server supports it.
	// +kubebuilder:validation:Optional
	RegistrationEndpoint string `json:"registrationEndpoint,omitempty"`

	// AuthorizationEndpoint is the OAuth 2.1 authorization endpoint
	// (RFC 8414 `authorization_endpoint`).
	// +kubebuilder:validation:Optional
	AuthorizationEndpoint string `json:"authorizationEndpoint,omitempty"`

	// TokenEndpoint is the OAuth 2.1 token endpoint
	// (RFC 8414 `token_endpoint`).
	// +kubebuilder:validation:Optional
	TokenEndpoint string `json:"tokenEndpoint,omitempty"`

	// LastDiscovered is the timestamp of the most recent successful
	// discovery probe against the server.
	// +kubebuilder:validation:Optional
	LastDiscovered *metav1.Time `json:"lastDiscovered,omitempty"`
}

// MCPServerStatus defines the observed state of MCPServer
type MCPServerStatus struct {
	// +kubebuilder:validation:Optional
	// ResolvedAddress contains the actual resolved address value
	ResolvedAddress string `json:"resolvedAddress,omitempty"`

	// ToolCount represents the number of tools discovered from this MCP server
	// +kubebuilder:validation:Optional
	ToolCount int `json:"toolCount,omitempty"`

	// Authorization holds OAuth 2.1 / RFC 9728 discovery metadata when the
	// MCP server requires authorization. Populated by the controller when
	// a 401 response is received; not set otherwise.
	// +kubebuilder:validation:Optional
	Authorization *MCPServerAuthorizationStatus `json:"authorization,omitempty"`

	// Conditions represent the latest available observations of the MCP server's state
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Available",type="string",JSONPath=".status.conditions[?(@.type=='Available')].status"
// +kubebuilder:printcolumn:name="Discovering",type="string",JSONPath=".status.conditions[?(@.type=='Discovering')].status",description="Discovery status"
// +kubebuilder:printcolumn:name="Tools",type="integer",JSONPath=".status.toolCount",description="Number of tools"
// +kubebuilder:printcolumn:name="Auth",type="boolean",JSONPath=".status.authorization.required",description="Authorization required"
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
