## ADDED Requirements

### Requirement: MCPServer status surfaces structured OAuth authorization metadata

The `MCPServer` CRD (v1alpha1) SHALL include a new optional `status.authorization` object. Absence of this sub-resource means the server does not require authorization. When the controller detects that an MCP server requires OAuth authorization (per RFC 9728 / MCP 2025-06-18), it SHALL populate the following fields from discovery:

- `state` (`string` enum) — current authorization state. One of `Required` (401 observed and discovery succeeded) or `DiscoveryFailed` (401 observed but no usable RFC 9728 metadata was obtained). Future changes extend this enum with `Authorized`, `Expired`, and `RefreshFailed` once token exchange lands. Exposed on the `MCPServer` printcolumn as `AUTH`.
- `resource` (`string`) — the `resource` value from the protected resource metadata document (RFC 9728 §2).
- `resourceMetadataURL` (`string`) — the `resource_metadata` URL parsed from the `WWW-Authenticate` header.
- `resourceName` (`string`, optional) — the `resource_name` from RFC 9728 metadata.
- `authorizationServers` (`[]string`) — the `authorization_servers` array from RFC 9728 metadata.
- `scopesSupported` (`[]string`, optional) — the `scopes_supported` array from RFC 8414 authorization server metadata.
- `grantTypesSupported` (`[]string`, optional) — the `grant_types_supported` array from RFC 8414.
- `registrationEndpoint` (`string`, optional) — the `registration_endpoint` from RFC 8414 (indicates RFC 7591 dynamic client registration support).
- `authorizationEndpoint` (`string`, optional) — `authorization_endpoint` from RFC 8414.
- `tokenEndpoint` (`string`, optional) — `token_endpoint` from RFC 8414.
- `lastDiscovered` (`metav1.Time`, optional) — timestamp of the last successful discovery probe.

These fields are **read-only outputs** of the controller; no spec-side inputs are added in this change.

#### Scenario: Remote MCP server returns 401 with standards-compliant WWW-Authenticate

- **GIVEN** an `MCPServer` resource with `spec.address.value = https://mcp.notion.com/mcp` and no authorization headers configured
- **WHEN** the controller reconciles and the initial MCP `initialize` call returns HTTP 401 with `WWW-Authenticate: Bearer realm="OAuth", resource_metadata="https://mcp.notion.com/.well-known/oauth-protected-resource/mcp"`
- **THEN** the controller SHALL fetch the resource metadata URL and the `authorization_servers[0]` `/.well-known/oauth-authorization-server` metadata
- **AND** populate `status.authorization.state = "Required"`, `resource`, `resourceMetadataURL`, `resourceName`, `authorizationServers`, `registrationEndpoint`, `authorizationEndpoint`, `tokenEndpoint`, `scopesSupported`, `grantTypesSupported`, `lastDiscovered`
- **AND** NOT set `status.toolCount` (auth-required servers never list tools)

#### Scenario: MCP server returns 401 without a parseable WWW-Authenticate header

- **WHEN** the upstream returns 401 but the `WWW-Authenticate` header is missing, is not a `Bearer` challenge, or does not contain a `resource_metadata` parameter
- **THEN** the controller SHALL set `Available=False` with `reason: AuthorizationDiscoveryFailed` and a message quoting the observed header
- **AND** SHALL populate `status.authorization` with `state: DiscoveryFailed`, `resource` derived from the resolved address, and `lastDiscovered` — leaving metadata fields (`resourceMetadataURL`, `authorizationServers`, `authorizationEndpoint`, `tokenEndpoint`, `registrationEndpoint`, `scopesSupported`, `grantTypesSupported`, `resourceName`) empty so the dashboard cannot attempt to drive an OAuth flow
- **AND** SHALL emit an `AuthorizationRequired` warning event noting the absence of discovery metadata

#### Scenario: Protected resource metadata endpoint is unreachable or malformed

- **WHEN** the `WWW-Authenticate` header advertises a `resource_metadata` URL but the URL cannot be fetched (network error, non-2xx response) or the response body is not valid RFC 9728 JSON
- **THEN** the controller SHALL set `Available=False` with `reason: AuthorizationDiscoveryFailed` and a message including the underlying fetch/parse error
- **AND** SHALL populate `status.authorization` with `state: DiscoveryFailed` and the `resource` / `lastDiscovered` fields only

#### Scenario: Authorization server metadata endpoint is unreachable

- **WHEN** RFC 9728 metadata was fetched successfully but the subsequent RFC 8414 `oauth-authorization-server` endpoint cannot be reached
- **THEN** the controller SHALL still set `Available=False` with `reason: AuthorizationRequired`
- **AND** SHALL populate `status.authorization` with the RFC 9728 fields only (leaving `authorizationEndpoint`, `tokenEndpoint`, `registrationEndpoint`, `grantTypesSupported` empty)
- **AND** SHALL log the RFC 8414 fetch failure at INFO level

#### Scenario: MCP server response is not an auth failure

- **WHEN** the MCP client creation fails for any reason other than HTTP 401 (network error, DNS failure, TLS error, 5xx, etc.)
- **THEN** `status.authorization` SHALL NOT be populated
- **AND** the existing `ClientCreationFailed` condition behaviour SHALL be preserved unchanged

### Requirement: MCPServer surfaces AuthorizationRequired condition reason

The controller SHALL use a new condition reason constant `AuthorizationRequired` on the existing `Available` condition (`type: Available, status: False`) when — and only when — authorization discovery succeeds. This reason is distinct from `ClientCreationFailed`, `AddressResolutionFailed`, and `ToolListingFailed`, allowing the dashboard and other consumers to branch on auth state without string-matching the error message.

#### Scenario: Controller sets AuthorizationRequired condition

- **WHEN** authorization metadata has been discovered and populated on `status.authorization`
- **THEN** the `Available` condition SHALL have `status: "False"`, `reason: "AuthorizationRequired"`, and `message` referencing the `resourceName` (or `resource` if `resourceName` absent) with a hint that authorization is required
- **AND** the `Discovering` condition SHALL be set to `status: "False"` with `reason: "AuthorizationRequired"` and a message explaining tool discovery cannot proceed until authorization is complete

#### Scenario: Controller emits AuthorizationRequired event

- **WHEN** the controller first transitions an `MCPServer` into the `AuthorizationRequired` state (or the resource metadata URL changes)
- **THEN** the controller SHALL emit a Kubernetes `Warning` event with reason `AuthorizationRequired` and a message including the resource metadata URL

### Requirement: Authorization discovery is idempotent and retried on a poll interval

The controller SHALL re-run discovery on every reconciliation cycle that results in a 401, respecting the existing `spec.pollInterval`. Once populated, `status.authorization` fields SHALL only change when the upstream metadata actually changes.

#### Scenario: Discovery metadata has not changed

- **WHEN** the controller re-runs discovery and the fetched resource metadata and authorization server metadata are byte-identical (modulo `lastDiscovered`) to the currently-stored values
- **THEN** the controller SHALL NOT emit a duplicate `AuthorizationRequired` event
- **AND** SHALL NOT bump the `lastTransitionTime` of the `Available` condition
- **AND** SHALL update `lastDiscovered`

#### Scenario: Discovery endpoints become unreachable after initial success

- **WHEN** `status.authorization.state` was previously `Required` and a follow-up discovery probe fails (e.g. the RFC 9728 endpoint is temporarily down)
- **THEN** `status.authorization` SHALL retain the previously-discovered values
- **AND** the controller SHALL log the probe failure and continue requeuing on `pollInterval`
