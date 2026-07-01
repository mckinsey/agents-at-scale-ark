## Why

When users interact via `kubectl`, Kubernetes RBAC enforces per-user permissions. When the same users interact via the Dashboard or ark-api with SSO authentication, all K8s API calls use the ark-api service account, bypassing user-level RBAC entirely. This is a privilege escalation vector: a user with read-only RBAC gains full write access through the API. Implements [#1768](https://github.com/mckinsey/agents-at-scale-ark/issues/1768).

## What Changes

- Extract user identity (username, groups) from validated JWT claims in auth middleware and store on request state
- Create impersonated K8s API clients that carry `Impersonate-User` and `Impersonate-Group` headers for SSO-authenticated requests
- Add an LRU-cached client pool to avoid per-request `ApiClient` instantiation overhead
- Reject client-supplied `Impersonate-*` headers to prevent escalation
- Add configurable OIDC claim mapping (`IMPERSONATION_USERNAME_CLAIM`, `IMPERSONATION_GROUPS_CLAIM`)
- Add `IMPERSONATION_ENABLED` flag (default: `false`) for backward compatibility
- Add `IMPERSONATION_FALLBACK` transitional mode that logs RBAC gaps without blocking access
- Propagate K8s 403 errors as structured, actionable API responses
- Grant ark-api service account `users` and `groups` impersonation RBAC
- API key (basic auth) and open mode are unaffected — impersonation applies only to JWT-authenticated requests

## Capabilities

### New Capabilities
- `api-impersonation`: JWT-to-K8s user impersonation in ark-api, including claim extraction, client pooling, header stripping, fallback mode, and structured error responses

### Modified Capabilities
- `ark-api-rbac`: ark-api service account needs `impersonate` verb on `users` and `groups` resources, gated by `impersonation.enabled` Helm value

## Impact

- **ark-sdk** (`lib/ark-sdk/`): `with_ark_client()` gains optional `impersonation` parameter; `TokenValidator.validate_token()` return value must be captured
- **ark-api** (`services/ark-api/`): Auth middleware, all 16+ route handlers (via FastAPI dependency injection), Helm chart RBAC templates, values.yaml
- **ark-dashboard** (`services/ark-dashboard/`): No code changes needed — proxies through ark-api which handles impersonation transparently
- **Existing deployments**: No impact at default settings (`IMPERSONATION_ENABLED=false`). Enabling requires K8s RoleBindings for SSO users.
