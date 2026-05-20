## 1. SDK Foundation (ark-sdk)

- [x] 1.1 Add `ImpersonationConfig` dataclass to `ark_sdk` (`lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/`) with `username: str` and `groups: list[str]` fields
- [x] 1.2 Add optional `impersonation: Optional[ImpersonationConfig]` parameter to `with_ark_client()` and `get_client()` in `client.py`; when provided, call `api_client.set_default_header("Impersonate-User", ...)` and set `Impersonate-Group` header(s) with comma-separated groups
- [x] 1.3 Write unit tests for `with_ark_client()` verifying impersonation headers are set when config is provided and absent when `None`
- [x] 1.4 Export `ImpersonationConfig` from `ark_sdk.__init__` (exported via `ark_sdk.impersonation` and `ark_sdk.client`)

## 2. Auth Middleware — Claim Extraction

- [x] 2.1 Add `UserIdentity` model (username, groups) to `services/ark-api/ark-api/src/ark_api/models/auth.py`
- [x] 2.2 Add impersonation settings to auth config: `IMPERSONATION_ENABLED`, `IMPERSONATION_FALLBACK`, `IMPERSONATION_USERNAME_CLAIM`, `IMPERSONATION_GROUPS_CLAIM`, `IMPERSONATION_PREFIX`
- [x] 2.3 Add `Impersonate-*` header rejection check at the top of `AuthMiddleware.__call__` in `middleware.py`, returning 403 for any request containing these headers
- [x] 2.4 Capture `TokenValidator.validate_token()` return value in middleware; extract username and groups from configured claims (supporting dot-path for nested claims like `realm_access.roles`); store `UserIdentity` on `request.state.user_identity`
- [x] 2.5 Return 401 with actionable error when `IMPERSONATION_ENABLED=true` and the configured username claim is missing from the JWT
- [x] 2.6 Write unit tests: claim extraction for various providers (email, preferred_username, nested paths), missing claims, prefix application, header rejection

## 3. Client Pool

- [x] 3.1 Implement `ImpersonatingClientPool` class in a new file `services/ark-api/ark-api/src/ark_api/auth/client_pool.py` with LRU cache keyed by `(username, frozenset(groups))`, configurable max size and TTL, async eviction with graceful client close
- [x] 3.2 Add `get_client(impersonation: Optional[ImpersonationConfig])` method that returns cached or new `ApiClient` with impersonation headers; `None` key returns shared non-impersonated client
- [x] 3.3 Write unit tests: cache hit/miss, eviction, TTL expiry, concurrent access safety, non-impersonated client reuse

## 4. FastAPI Dependency Injection

- [x] 4.1 Create `get_impersonation_config(request: Request) -> Optional[ImpersonationConfig]` dependency in `services/ark-api/ark-api/src/ark_api/auth/dependencies.py` that reads `request.state.user_identity`, checks `IMPERSONATION_ENABLED`, and returns config or `None`
- [x] 4.2 Update `with_ark_client()` usage in all route handlers to accept impersonation config via `Depends(get_impersonation_config)` and pass it through
- [x] 4.3 Write unit tests for the dependency: enabled/disabled, JWT vs API key path, missing identity

## 5. Error Handling and Fallback

- [x] 5.1 Add K8s 403 error interception in route handlers (or a shared utility) that catches `ApiException` with status 403, checks if impersonation was active, and returns structured JSON error response with `error`, `detail`, `user`, `resource`, `namespace`, `action` fields
- [x] 5.2 Implement fallback logic: when `IMPERSONATION_FALLBACK=true` and a 403 is received, retry the K8s call without impersonation, add `X-Ark-Impersonation-Fallback: true` response header, log WARNING with user and denied action
- [x] 5.3 Write unit tests: structured error format, fallback retry behavior, fallback header, logging

## 6. Helm Chart and Configuration

- [x] 6.1 Add `impersonation` section to `services/ark-api/chart/values.yaml` with `enabled: false`, `fallback: false`, `usernameClaim: email`, `groupsClaim: groups`, `prefix: ""`
- [x] 6.2 Add conditional impersonation RBAC rules (impersonate on users, groups) to `services/ark-api/chart/templates/rbac.yaml`, gated on `.Values.impersonation.enabled`
- [x] 6.3 Inject impersonation env vars from values into deployment template
- [x] 6.4 Verify chart renders correctly with `helm template` for both enabled and disabled states

## 7. Integration Testing

- [ ] 7.1 Add E2E test case: SSO user with RoleBinding can list agents via API (impersonation succeeds)
- [ ] 7.2 Add E2E test case: SSO user without RoleBinding gets structured 403 via API (impersonation enforced)
- [ ] 7.3 Add E2E test case: API key user is unaffected by impersonation settings
- [ ] 7.4 Add E2E test case: client-supplied `Impersonate-*` headers are rejected with 403
