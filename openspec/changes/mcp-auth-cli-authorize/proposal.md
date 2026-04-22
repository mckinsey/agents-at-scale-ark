## Why

`mcp-auth-detection` gets Ark as far as detecting that a remote MCP server needs OAuth and surfacing `status.authorization.state = Required`. Nothing then closes the loop: an operator sees `AUTH=Required` on the CRD and has no supported path to obtain a token, so the MCPServer is stuck unavailable. Agents cannot call `mcp.notion.com/mcp` or any other OAuth-protected MCP server end-to-end.

This change closes the loop from `Required` to `Authorized`. A new `ark mcp auth <name>` CLI command performs OAuth 2.1 Authorization Code + PKCE (with RFC 7591 Dynamic Client Registration when advertised), writes the resulting tokens into a Kubernetes Secret, and lets the controller inject `Authorization: Bearer <access_token>` on every MCP call and refresh the token as it nears expiry.

## What Changes

- `MCPServer` CRD gains `spec.authorization.tokenSecretRef` — a `SecretKeySelector`-style reference with defaulted keys (`access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`).
- `MCPServerAuthorizationState` enum extended with `Authorized`, `Expired`, `RefreshFailed`.
- Controller reads the referenced Secret on each reconcile, injects a Bearer header alongside existing `spec.headers`, refreshes the access token when within 60s of expiry, and transitions state on success/failure/revocation.
- Helm chart gains a Secret shell template (empty `stringData`, no `data:` block) so GitOps controllers do not prune controller-written keys.
- `ark mcp auth <name>` CLI command runs OAuth 2.1 + PKCE on the operator's workstation with a loopback redirect, performs DCR when `registrationEndpoint` is present, and populates the Secret.
- Documentation walking through the Notion MCP trust anchor flow end to end.

## Capabilities

### New Capabilities
- `mcp-auth-cli-authorize`: CRD, controller, CLI and Helm changes that let an operator authorize an OAuth-protected MCP server with `ark mcp auth` and have the controller drive token refresh and injection going forward.

### Modified Capabilities
- `mcp-auth-detection`: enum widened to include `Authorized | Expired | RefreshFailed`. Detection behaviour is unchanged.

## Impact

- `ark/api/v1alpha1/mcpserver_types.go` — `MCPServerSpec.Authorization` subresource, `TokenSecretRef`; enum additions.
- `ark/internal/controller/mcpserver_controller.go` — Secret resolution, token refresh loop, header injection, state transitions.
- `ark/internal/mcp/` — helper for injecting Bearer header into `createMCPClient` flow.
- `ark/chart/templates/` — Helm-managed Secret shell template, RBAC additions (`get`, `list`, `watch`, `update` on Secrets in the MCPServer namespace).
- `tools/ark-cli/` — `ark mcp auth <name>` command, OAuth client, local callback listener, Secret writer.
- `docs/` — operator guide for first-time auth against `mcp.notion.com/mcp`.
- No changes to `ark-api`, dashboard, or existing sample agents.

## Non-Goals

- Per-agent or per-user tokens (Fork 1B+ / deferred).
- Dashboard UI for OAuth (deferred — the CRD contract is the stable surface).
- `ark-api` brokered OAuth endpoint (v2, separate change).
- OAuth 2.0 Device Authorization Grant (RFC 8628).
- Token revocation on CRD delete (RFC 7009) — deferred; user revokes at the IdP.
- Per-MCPServer client metadata customisation beyond what DCR defaults provide.
