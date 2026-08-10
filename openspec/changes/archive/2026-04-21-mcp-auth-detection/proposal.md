## Why

Remote MCP servers that require OAuth (e.g. `https://mcp.notion.com/mcp`, GitHub Copilot MCP, Atlassian MCP) return `HTTP 401` with a standards-compliant `WWW-Authenticate: Bearer resource_metadata=<url>` header per RFC 9728 and the MCP 2025-06-18 authorization spec. The Ark controller currently swallows this response inside the go-sdk `Connect()` call and surfaces it as a generic `ClientCreationFailed` condition with message `"Unauthorized"`. The OAuth discovery data — resource metadata URL, authorization server(s), supported scopes — is discarded before reaching the CRD. The dashboard has no signal to distinguish "needs authentication" from "server is down" and cannot render an actionable UI.

This change introduces **authorization state detection only**. No OAuth client, no token exchange, no browser flow — those follow in separate changes. The goal is to make the failure mode observable and structured so downstream components (dashboard, CLI, future `ark-api` OAuth flow) have a stable contract to act on.

## What Changes

- **`MCPServer` CRD (v1alpha1)** gains `status.authorization` with structured OAuth metadata fields populated from the protected-resource-metadata discovery.
- **`MCPServer` CRD (v1alpha1)** gains a new condition reason `AuthorizationRequired` used with `type: Available, status: False` to distinguish auth failures from other client-creation failures.
- **Ark controller (`mcpserver_controller.go` + `internal/mcp/`)** performs a pre-flight HTTP probe when the MCP SDK returns an `Unauthorized` error. It parses `WWW-Authenticate`, fetches RFC 9728 resource metadata, fetches RFC 8414 authorization server metadata, and populates `status.authorization`.
- **Event emission**: `AuthorizationRequired` event with the resource metadata URL.

## Non-Goals (deferred to later changes)

- OAuth 2.1 dynamic client registration (RFC 7591).
- Authorization code + PKCE flow.
- Token storage / refresh / injection.
- Dashboard "Authorize" button.
- `fark mcp auth` CLI command.
- Multi-user token binding.

## Division of Responsibility

The long-term architecture separates concerns cleanly:

| Component | Role |
|-----------|------|
| **ark-controller** (Go) | Detects authorization state from MCP server responses. Surfaces metadata on CRD status. Later: reads access tokens from a Secret and injects them as `Authorization: Bearer` headers; refreshes tokens near expiry. **No OAuth client logic, no browser, no registration.** |
| **ark-api** (Python / later changes) | OAuth "brain". Performs RFC 7591 dynamic client registration, constructs authorization URLs with PKCE + `resource` parameter, hosts the OAuth callback endpoint, exchanges authorization codes for tokens, writes tokens into Secrets. Consumed by the dashboard. |
| **Dashboard / CLI** (later changes) | User-facing entry point. Dashboard calls ark-api endpoints; `fark mcp auth` CLI uses loopback redirect and writes the same Secret contract directly. |
| **Secret contract** (later changes) | Integration seam between ark-api (writer) and ark-controller (reader). |

**This change lands the controller half of the contract only.** The CRD status fields are the stable interface future changes will consume.

## Capabilities

### New Capabilities
- `mcp-auth-detection`: controller detects OAuth-protected MCP servers, performs RFC 9728 discovery, and surfaces authorization metadata on `MCPServer.status`.

## Impact

- `ark/api/v1alpha1/mcpserver_types.go` — new `MCPServerAuthorizationStatus` type; new `Authorization` field on `MCPServerStatus`.
- `ark/config/crd/bases/ark.mckinsey.com_mcpservers.yaml` — regenerated via `make manifests`.
- `ark/internal/controller/mcpserver_controller.go` — new condition reason `AuthorizationRequired`; dispatch to OAuth-detection branch when client creation fails with 401.
- `ark/internal/mcp/oauth_discovery.go` — new file; parses `WWW-Authenticate`, fetches RFC 9728 and RFC 8414 metadata.
- `ark/internal/mcp/mcp.go` — surface typed `UnauthorizedError` from `Connect()` path so controller can branch without string matching.
- `ark/internal/eventing/` — new `AuthorizationRequired` event recorder.
- **No dashboard, ark-api, or SDK changes in this change.** They consume the status fields in follow-up changes.
