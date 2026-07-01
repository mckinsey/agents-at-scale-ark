## Context

The Ark API authenticates external requests via JWT (OIDC) or API keys, but all Kubernetes API calls use the ark-api pod's service account. User identity from JWT tokens is validated then discarded — `TokenValidator.validate_token()` returns the full decoded payload, but the middleware ignores the return value. This means K8s RBAC roles (the `*_viewer_role`, `*_editor_role`, `*_admin_role` ClusterRoles that Ark ships) are never enforced for API/Dashboard users.

The Go operator already implements impersonation for Query execution via `rest.ImpersonationConfig` in `getClientForQuery()`. This change extends the same pattern to the Python API layer.

Relevant code:
- `services/ark-api/ark-api/src/ark_api/auth/middleware.py` — Auth middleware, line 137 discards JWT claims
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/client.py` — `with_ark_client()` accepts only `namespace` and `version`
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/auth/validator.py` — `validate_token()` returns `Dict[str, Any]`
- `ark/internal/controller/query_controller.go:742-766` — Existing Go impersonation pattern

## Goals / Non-Goals

**Goals:**
- SSO/JWT-authenticated users are subject to the same K8s RBAC as kubectl users
- Configurable OIDC claim mapping for different identity providers
- Safe migration path that does not break existing deployments
- Clear, actionable error messages when RBAC denies access
- Efficient K8s client management (no per-request client instantiation overhead)

**Non-Goals:**
- Application-level RBAC within ark-api (complementary to #1184, not a replacement)
- Auto-injecting user identity into Query `spec.serviceAccount` (separate concern)
- Impersonation for API key (basic auth) requests — these are machine identities, already namespace-scoped
- Multi-cluster impersonation or federated identity

## Decisions

### 1. Use K8s impersonation headers, not a proxy

**Decision**: Set `Impersonate-User` and `Impersonate-Group` HTTP headers on the K8s API client rather than deploying a separate proxy like kube-oidc-proxy.

**Alternatives considered**:
- **kube-oidc-proxy sidecar**: Adds operational complexity (another pod, TLS config, health checks). Ark already has the JWT token in-process — forwarding identity is simpler.
- **K8s TokenReview/SubjectAccessReview per request**: Too many round-trips. Impersonation is a single header per request.

**Rationale**: The operator already uses this pattern in Go. The Python `kubernetes_asyncio` library supports custom headers via `ApiClient.set_default_header()`. Keeps the change self-contained within ark-api and ark-sdk.

### 2. LRU-cached client pool keyed by user identity

**Decision**: Maintain an LRU cache of `ApiClient` instances keyed by `(username, frozenset(groups))`. Reuse clients for the same user across requests.

**Alternatives considered**:
- **New ApiClient per request**: Each instantiation creates a new `aiohttp.ClientSession` with SSL context (~3-8ms init, ~50-500ms close). At scale, this defeats connection pooling and creates hundreds of independent TCP pools.
- **Single shared client with per-request header mutation**: Race condition — concurrent requests would overwrite each other's impersonation headers.
- **Thread-local / context-local clients**: asyncio doesn't have thread-local semantics that map cleanly to request scope.

**Rationale**: LRU cache (max ~100 entries, 5-minute TTL) gives connection reuse within the same user's concurrent requests, bounded memory via eviction, and amortized init cost. The `None` key serves API-key and open-mode requests using the original SA-based client.

```
ImpersonatingClientPool
  cache: LRU[CacheKey, ApiClient]
    ("jane@acme.com", {"team-a"})  → ApiClient(Impersonate-User: jane)
    ("bob@acme.com", {"team-b"})   → ApiClient(Impersonate-User: bob)
    None                           → ApiClient (no impersonation)

  get_client(impersonation: Optional[ImpersonationConfig]) → ApiClient
    - cache hit → return existing
    - cache miss → create new ApiClient, set headers, cache it
    - eviction → await old_client.close()
```

### 3. FastAPI dependency injection for impersonation context

**Decision**: Use a FastAPI `Depends()` function that extracts impersonation config from `request.state`, rather than modifying every route handler signature manually.

**Alternatives considered**:
- **Middleware that modifies a global**: Not request-scoped, same race condition as shared client.
- **Passing impersonation through every function call**: Invasive change to all 16+ route files and every `with_ark_client()` call.

**Rationale**: FastAPI's DI system is designed for this. A single dependency function constructs `ImpersonationConfig` from `request.state.user_identity` (set by middleware). Route handlers declare the dependency; `with_ark_client()` receives it. Changes to route handlers are minimal (add one `Depends` parameter).

```
AuthMiddleware
  → validates JWT
  → request.state.user_identity = UserIdentity(username, groups)

get_impersonation_config(request: Request) → Optional[ImpersonationConfig]
  → if not enabled or not JWT auth: return None
  → return ImpersonationConfig(username, groups)

route handler:
  async def list_agents(imp = Depends(get_impersonation_config)):
    async with with_ark_client(ns, VER, impersonation=imp) as client:
      ...
```

### 4. Reject (not strip) client-supplied Impersonate-* headers

**Decision**: Return 403 if any `Impersonate-*` header is present in the incoming request.

**Alternatives considered**:
- **Silently strip headers**: Attacker doesn't know it failed, might assume escalation worked. Also masks configuration errors.
- **Allow if user has impersonation RBAC**: Overly complex, the API is not a general-purpose K8s proxy.

**Rationale**: Client-supplied impersonation headers are always an attack or misconfiguration. Rejecting loudly is the safest default.

### 5. Fail closed on missing JWT claims with actionable error

**Decision**: If the configured claim (e.g., `email`) is absent from the JWT, return 401 with a message specifying which claim is missing and how to fix it.

**Alternatives considered**:
- **Fall back to `sub` claim**: Often an opaque UUID, making K8s RBAC bindings impractical. Creates false sense of security.
- **Fail with generic 401**: Leaves admins guessing which claim to configure.

**Rationale**: Consistent with existing middleware behavior — startup validation already fails fast with clear messages when OIDC env vars are missing. Same principle at request time.

### 6. Transitional fallback mode

**Decision**: Add `IMPERSONATION_FALLBACK=true` mode that attempts impersonation, falls back to ark-api SA on 403, and logs a warning.

**Alternatives considered**:
- **Hard cutover only**: Any RBAC gap breaks all SSO access immediately. High risk for existing deployments.
- **Audit-only mode** (impersonate in parallel, log results, use SA): Doubles K8s API load, complex implementation.

**Rationale**: Fallback mode is the gentlest migration path. Admins enable impersonation, check logs for "User X missing RBAC, fell back to SA" messages, create RoleBindings, then disable fallback. Response includes `X-Ark-Impersonation-Fallback: true` header for dashboard awareness.

## Risks / Trade-offs

**[Client pool memory]** → LRU eviction at 100 entries bounds memory. Most deployments have <50 concurrent dashboard users. Evicted clients are closed asynchronously.

**[Claim mapping misconfiguration]** → Wrong claim name silently produces incorrect K8s usernames. Mitigation: log the extracted username on first impersonated request per user; add a `/health/impersonation` diagnostic endpoint that shows claim mapping config (not values).

**[kubernetes_asyncio multi-group headers]** → `Impersonate-Group` should appear multiple times (one per group). `set_default_header()` uses a dict (one value per key). Mitigation: use comma-separated value in a single header — K8s API server accepts both formats. Verify in integration tests.

**[Fallback mode masks real RBAC gaps]** → If admins forget to disable fallback, impersonation is effectively optional. Mitigation: log at WARNING level on every fallback; add a Helm values comment noting fallback is transitional.

**[Async client close on eviction]** → Closing an `ApiClient` with active requests could cause errors. Mitigation: eviction marks client as draining; new requests get a fresh client; old client closes after a grace period.

## Migration Plan

1. **Deploy with defaults** — `IMPERSONATION_ENABLED=false`. No behavioral change.
2. **Create RoleBindings** — Use existing Ark ClusterRoles (`agent_viewer_role`, etc.) to bind SSO users/groups.
3. **Enable fallback mode** — Set `IMPERSONATION_ENABLED=true`, `IMPERSONATION_FALLBACK=true`. Monitor logs for fallback warnings.
4. **Fix RBAC gaps** — Create missing RoleBindings for users identified in logs.
5. **Disable fallback** — Set `IMPERSONATION_FALLBACK=false`. K8s RBAC is now fully enforced.
6. **Rollback** — Set `IMPERSONATION_ENABLED=false` to immediately revert to SA-based access.

## Open Questions

- Should the `ImpersonationConfig` be extended to support `Impersonate-Uid` (K8s 1.22+) for providers that expose a stable user ID?
- Should fallback mode have a configurable expiry (e.g., auto-disable after 30 days) to prevent permanent transitional state?
