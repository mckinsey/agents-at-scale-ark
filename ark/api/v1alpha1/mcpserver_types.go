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
	// Timeout bounds establishing the connection to this server, including the
	// connection retry window. It does not bound individual tool calls once the
	// connection is established - use toolCallTimeout for that.
	// Defaults to "30s" if not specified.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="30s"
	Timeout string `json:"timeout,omitempty"`
	// ToolCallTimeout bounds each individual tool call to this server
	// (e.g., "30s", "5m", "10m"). Use this to support long-running operations.
	// When unset, a tool call is bounded only by the execution budget of the
	// query that triggered it.
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Pattern=`^([0-9]+(\.[0-9]+)?(ms|s|m|h))+$`
	ToolCallTimeout string `json:"toolCallTimeout,omitempty"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=http;sse
	// +kubebuilder:default="http"
	Transport string `json:"transport,omitempty"`
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="1m"
	PollInterval *metav1.Duration `json:"pollInterval,omitempty"`

	// Authorization configures how the controller obtains and injects
	// credentials for OAuth-protected MCP servers. When unset, the
	// controller does not attempt to inject Authorization headers.
	// +kubebuilder:validation:Optional
	Authorization *MCPServerAuthorizationSpec `json:"authorization,omitempty"`
}

// MCPServerAuthorizationSpec configures how the controller sources
// OAuth credentials for an MCPServer. Fork 1A scope is a single shared
// token per server, stored in a Kubernetes Secret in the same namespace.
type MCPServerAuthorizationSpec struct {
	// TokenSecretRef references the Kubernetes Secret holding OAuth
	// tokens and client credentials. The Secret MUST exist in the same
	// namespace as the MCPServer.
	// +kubebuilder:validation:Required
	TokenSecretRef TokenSecretReference `json:"tokenSecretRef"`

	// ClientCredentials enables controller-managed machine-to-machine
	// token acquisition. When set, the controller mints and renews the
	// access token written to TokenSecretRef; no interactive browser
	// flow is offered for this server.
	//
	// Implements the MCP OAuth Client Credentials Extension at
	// modelcontextprotocol/ext-auth@ce15435. That extension is a draft
	// and still changing, so the revision is pinned rather than tracking
	// main; behaviour may differ from later revisions.
	// +kubebuilder:validation:Optional
	ClientCredentials *ClientCredentialsSpec `json:"clientCredentials,omitempty"`
}

// ClientCredentialsSpec configures OAuth 2.0 `client_credentials`
// (RFC 6749 §4.4) token acquisition for an authorization server that has
// pre-registered Ark as a client. Registration is out-of-band: the MCP
// OAuth Client Credentials Extension does not permit dynamic client
// registration in the machine flow.
//
// This describes how a token is obtained. TokenSecretRef describes where
// it is written, and its name stays stable across renewals.
//
// Implemented against the MCP OAuth Client Credentials Extension at
// modelcontextprotocol/ext-auth@ce15435. The extension is a draft and is
// still changing, so the revision is pinned rather than tracking main.
type ClientCredentialsSpec struct {
	// ClientID is the OAuth client identifier the authorization server
	// assigned to Ark during out-of-band registration.
	// +kubebuilder:validation:Required
	ClientID string `json:"clientID"`

	// Scopes are requested in the token request. When empty, the
	// authorization server's default scopes for the client apply.
	// +kubebuilder:validation:Optional
	Scopes []string `json:"scopes,omitempty"`

	// Resource is the RFC 8707 resource indicator sent with the token
	// request. Normally taken from discovered RFC 9728 metadata; set it
	// explicitly only as an interoperability override.
	// +kubebuilder:validation:Optional
	Resource string `json:"resource,omitempty"`

	// TokenEndpoint is the authorization server's token endpoint.
	// Normally taken from discovered RFC 8414 metadata; set it explicitly
	// only as an interoperability override. Discovery still runs either
	// way — it is driven by the server's 401 challenge, not by this field
	// — and the advertised capabilities it returns are still validated.
	// Must be https, or a loopback address for development.
	// +kubebuilder:validation:Optional
	TokenEndpoint string `json:"tokenEndpoint,omitempty"`

	// ClientAuthentication selects how Ark authenticates itself to the
	// token endpoint.
	// +kubebuilder:validation:Required
	ClientAuthentication ClientAuthenticationSpec `json:"clientAuthentication"`
}

// ClientAuthenticationSpec selects a client authentication method.
//
// A discriminated union: exactly one member must be set. Only
// privateKeyJWT exists today, but it is a pointer with a CEL constraint
// so that adding serviceAccountToken or workloadIdentity later is
// additive. Declaring it required and non-pointer would make every
// future variant a breaking change to this field.
// +kubebuilder:validation:XValidation:rule="[has(self.privateKeyJWT)].exists_one(x, x)",message="exactly one client authentication method must be set"
type ClientAuthenticationSpec struct {
	// PrivateKeyJWT authenticates with a signed JWT assertion
	// (RFC 7523 §2.2).
	// +kubebuilder:validation:Optional
	PrivateKeyJWT *PrivateKeyJWTSpec `json:"privateKeyJWT,omitempty"`
}

// PrivateKeyJWTSpec configures RFC 7523 client authentication. The
// authorization server verifies the assertion against a public key
// registered for ClientID out-of-band.
type PrivateKeyJWTSpec struct {
	// SecretKeyRef points at the PEM-encoded private signing key. This
	// is sensitive input: it is never copied into the token Secret,
	// status, events, logs, metrics, or traces.
	// +kubebuilder:validation:Required
	SecretKeyRef SigningKeySecretKeyRef `json:"secretKeyRef"`

	// Algorithm is the JWS algorithm used to sign the assertion. It MUST
	// appear in the authorization server's
	// `token_endpoint_auth_signing_alg_values_supported`.
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=ES256;ES384;ES512;RS256;RS384;RS512;PS256;PS384;PS512
	// +kubebuilder:default="ES256"
	Algorithm string `json:"algorithm,omitempty"`

	// KeyID is the `kid` JOSE header stamped on the assertion, letting
	// the authorization server select among several registered keys.
	// +kubebuilder:validation:Optional
	KeyID string `json:"keyID,omitempty"`
}

// SigningKeySecretKeyRef names the Secret and key holding the private
// signing key, in the same namespace as the MCPServer.
type SigningKeySecretKeyRef struct {
	// +kubebuilder:validation:Required
	Name string `json:"name"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="private.pem"
	Key string `json:"key,omitempty"`
}

// TokenSecretReference points at a Secret and names the keys inside it
// that carry OAuth state. Keys default to the values defined in the
// mcp-auth-cli-authorize spec.
type TokenSecretReference struct {
	// +kubebuilder:validation:Required
	Name string `json:"name"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="access_token"
	AccessTokenKey string `json:"accessTokenKey,omitempty"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="refresh_token"
	RefreshTokenKey string `json:"refreshTokenKey,omitempty"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="expires_at"
	ExpiresAtKey string `json:"expiresAtKey,omitempty"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="client_id"
	ClientIDKey string `json:"clientIDKey,omitempty"`

	// +kubebuilder:validation:Optional
	// +kubebuilder:default="client_secret"
	ClientSecretKey string `json:"clientSecretKey,omitempty"`
}

// MCPServerAuthorizationState enumerates the observable authorization
// states of an MCP server. An empty value (the absence of the
// `authorization` sub-resource) means authorization is not required.
// `Authorized` indicates the controller successfully listed tools using
// a Bearer token from `spec.authorization.tokenSecretRef`. A 401 from the
// upstream — expiry, revocation, refresh failure — collapses back to
// `Required` and emits a `TokenRejected` event so the transition is
// observable without a dedicated state.
// +kubebuilder:validation:Enum=Required;DiscoveryFailed;Authorized
type MCPServerAuthorizationState string

const (
	// MCPServerAuthorizationStateRequired indicates the server responded
	// with HTTP 401 and RFC 9728 discovery succeeded.
	MCPServerAuthorizationStateRequired MCPServerAuthorizationState = "Required"

	// MCPServerAuthorizationStateDiscoveryFailed indicates the server
	// responded with HTTP 401 but no usable RFC 9728 metadata could be
	// obtained.
	MCPServerAuthorizationStateDiscoveryFailed MCPServerAuthorizationState = "DiscoveryFailed"

	// MCPServerAuthorizationStateAuthorized indicates the controller
	// connected to the MCP server using a Bearer token resolved from
	// `spec.authorization.tokenSecretRef`.
	MCPServerAuthorizationStateAuthorized MCPServerAuthorizationState = "Authorized"
)

// MCPServerAuthorizationStatus surfaces OAuth 2.1 / RFC 9728 Protected
// Resource Metadata discovered from an MCP server that requires
// authorization, per the MCP 2025-06-18 authorization specification.
//
// Populated by the controller when a server responds with HTTP 401.
// Read-only — consumers (dashboard, future ark-api OAuth flow) use
// this as a stable contract. Absence of this sub-resource means
// authorization is not required.
type MCPServerAuthorizationStatus struct {
	// State names the current authorization state. Exposed on the
	// MCPServer printcolumn as AUTH. Empty (absent) means the server
	// does not require authorization.
	// +kubebuilder:validation:Optional
	State MCPServerAuthorizationState `json:"state,omitempty"`

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

	// TokenEndpointAuthMethodsSupported is the set of client
	// authentication methods the token endpoint accepts (RFC 8414
	// `token_endpoint_auth_methods_supported`). The client-credentials
	// path requires `private_key_jwt` to appear here.
	// +kubebuilder:validation:Optional
	TokenEndpointAuthMethodsSupported []string `json:"tokenEndpointAuthMethodsSupported,omitempty"`

	// TokenEndpointAuthSigningAlgValuesSupported is the set of JWS
	// algorithms the token endpoint accepts for signed client assertions
	// (RFC 8414 `token_endpoint_auth_signing_alg_values_supported`).
	// +kubebuilder:validation:Optional
	TokenEndpointAuthSigningAlgValuesSupported []string `json:"tokenEndpointAuthSigningAlgValuesSupported,omitempty"`

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

	// ExpiresAt is the absolute time at which the current access_token
	// expires, published for dashboard / observability consumers that
	// may have `get` on mcpservers but not on secrets.
	// +kubebuilder:validation:Optional
	ExpiresAt *metav1.Time `json:"expiresAt,omitempty"`
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
// +kubebuilder:printcolumn:name="Auth",type="string",JSONPath=".status.authorization.state",description="OAuth authorization state"
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
