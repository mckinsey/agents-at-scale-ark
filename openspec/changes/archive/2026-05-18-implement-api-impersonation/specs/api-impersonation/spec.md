## ADDED Requirements

### Requirement: JWT claim extraction and request state propagation
The auth middleware SHALL capture the decoded JWT payload returned by `TokenValidator.validate_token()` and store user identity on `request.state.user_identity` as a structured object containing `username` (string) and `groups` (list of strings).

The username SHALL be extracted from the claim specified by `IMPERSONATION_USERNAME_CLAIM` (default: `email`). The groups SHALL be extracted from the claim specified by `IMPERSONATION_GROUPS_CLAIM` (default: `groups`). An optional `IMPERSONATION_PREFIX` SHALL be prepended to both username and group values when set.

Claims SHALL be extracted regardless of whether impersonation is enabled, to support future authorization features.

#### Scenario: JWT with email and groups claims
- **WHEN** a request arrives with a valid JWT containing `{"email": "jane@acme.com", "groups": ["team-a", "admins"]}`
- **AND** `IMPERSONATION_USERNAME_CLAIM=email` and `IMPERSONATION_GROUPS_CLAIM=groups`
- **THEN** `request.state.user_identity.username` is `"jane@acme.com"`
- **AND** `request.state.user_identity.groups` is `["team-a", "admins"]`

#### Scenario: JWT missing configured username claim
- **WHEN** a request arrives with a valid JWT that does not contain the claim specified by `IMPERSONATION_USERNAME_CLAIM`
- **AND** `IMPERSONATION_ENABLED=true`
- **THEN** the request is rejected with HTTP 401
- **AND** the response body includes the missing claim name and guidance to check `IMPERSONATION_USERNAME_CLAIM` configuration

#### Scenario: JWT missing groups claim
- **WHEN** a request arrives with a valid JWT that does not contain the claim specified by `IMPERSONATION_GROUPS_CLAIM`
- **AND** `IMPERSONATION_ENABLED=true`
- **THEN** `request.state.user_identity.groups` is an empty list
- **AND** the request proceeds (groups are optional)

#### Scenario: Prefix applied to extracted identity
- **WHEN** `IMPERSONATION_PREFIX=oidc:` and the JWT contains `{"email": "jane@acme.com", "groups": ["team-a"]}`
- **THEN** `request.state.user_identity.username` is `"oidc:jane@acme.com"`
- **AND** `request.state.user_identity.groups` is `["oidc:team-a"]`

#### Scenario: API key authentication
- **WHEN** a request is authenticated via API key (basic auth)
- **THEN** `request.state.user_identity` is not set
- **AND** `request.state.api_key` continues to be set as before

### Requirement: Impersonated K8s client via with_ark_client
The `with_ark_client()` function in ark-sdk SHALL accept an optional `impersonation` parameter of type `ImpersonationConfig`. When provided, the K8s `ApiClient` SHALL include `Impersonate-User` and `Impersonate-Group` headers on all API calls.

When `impersonation` is `None` (default), behavior SHALL be unchanged — the pod's service account is used.

#### Scenario: Impersonated client creates agent
- **WHEN** `with_ark_client(namespace, version, impersonation=ImpersonationConfig(username="jane@acme.com", groups=["team-a"]))` is called
- **AND** the caller lists agents
- **THEN** the K8s API request includes header `Impersonate-User: jane@acme.com`
- **AND** the K8s API request includes header `Impersonate-Group: team-a`
- **AND** K8s RBAC is evaluated against `jane@acme.com` with group `team-a`

#### Scenario: Non-impersonated client (default)
- **WHEN** `with_ark_client(namespace, version)` is called without impersonation
- **THEN** no `Impersonate-*` headers are set
- **AND** the request uses the pod's service account identity

#### Scenario: Multiple groups
- **WHEN** impersonation is configured with `groups=["team-a", "team-b", "admins"]`
- **THEN** all three groups are included in `Impersonate-Group` headers

### Requirement: LRU client pool
The ark-api SHALL maintain an LRU cache of impersonated `ApiClient` instances keyed by `(username, frozenset(groups))`. Clients SHALL be reused across requests for the same user identity.

The cache SHALL have a configurable maximum size (default: 100) and TTL (default: 5 minutes). When a client is evicted, it SHALL be closed asynchronously.

#### Scenario: Same user makes multiple requests
- **WHEN** user `jane@acme.com` makes 10 concurrent API requests
- **THEN** all 10 requests use the same cached `ApiClient` instance
- **AND** only one `aiohttp.ClientSession` is created for that user

#### Scenario: Cache eviction
- **WHEN** the cache is at maximum capacity
- **AND** a new user makes a request
- **THEN** the least recently used client is evicted
- **AND** the evicted client's `aiohttp.ClientSession` is closed asynchronously

#### Scenario: Non-impersonated requests use shared client
- **WHEN** requests arrive via API key auth or with impersonation disabled
- **THEN** all requests share a single non-impersonated `ApiClient`
- **AND** this client is never evicted from the cache

### Requirement: Reject client-supplied impersonation headers
The auth middleware SHALL reject any incoming request that contains HTTP headers starting with `Impersonate-` (case-insensitive) with HTTP 403.

This check SHALL run before authentication, for all auth modes.

#### Scenario: Client sends Impersonate-User header
- **WHEN** a request includes the header `Impersonate-User: admin@acme.com`
- **THEN** the request is rejected with HTTP 403
- **AND** the response body states that client-supplied impersonation headers are not allowed

#### Scenario: Client sends Impersonate-Group header
- **WHEN** a request includes the header `Impersonate-Group: cluster-admins`
- **THEN** the request is rejected with HTTP 403

#### Scenario: Health check with impersonation header
- **WHEN** a request to `/health` includes the header `Impersonate-User: admin@acme.com`
- **THEN** the request is rejected with HTTP 403 (check runs before route matching)

### Requirement: Impersonation feature flag
Impersonation SHALL be controlled by the `IMPERSONATION_ENABLED` environment variable (default: `false`).

When disabled, JWT claims are still extracted to `request.state.user_identity` but no `Impersonate-*` headers are added to K8s clients. All K8s calls use the ark-api service account.

#### Scenario: Impersonation disabled (default)
- **WHEN** `IMPERSONATION_ENABLED=false`
- **AND** an SSO user makes a request
- **THEN** K8s API calls use the ark-api service account (no impersonation headers)
- **AND** the user's JWT claims are still extracted to `request.state.user_identity`

#### Scenario: Impersonation enabled
- **WHEN** `IMPERSONATION_ENABLED=true`
- **AND** an SSO user makes a request
- **THEN** K8s API calls include `Impersonate-User` and `Impersonate-Group` headers derived from JWT claims

#### Scenario: Impersonation enabled with API key auth
- **WHEN** `IMPERSONATION_ENABLED=true`
- **AND** a request is authenticated via API key
- **THEN** no impersonation headers are added (API keys are machine identities)

### Requirement: Fallback mode
When `IMPERSONATION_FALLBACK=true` (default: `false`) and `IMPERSONATION_ENABLED=true`, the API SHALL attempt impersonated K8s calls. If a K8s 403 Forbidden response is received, the API SHALL retry the call using the ark-api service account.

On fallback, the API SHALL:
- Log a WARNING with the username, resource, namespace, and action that was denied
- Add response header `X-Ark-Impersonation-Fallback: true`

#### Scenario: Impersonated call succeeds
- **WHEN** fallback mode is enabled
- **AND** user `jane@acme.com` has a RoleBinding granting agent list access
- **AND** the user lists agents
- **THEN** the impersonated call succeeds
- **AND** no `X-Ark-Impersonation-Fallback` header is present

#### Scenario: Impersonated call fails, fallback succeeds
- **WHEN** fallback mode is enabled
- **AND** user `bob@acme.com` has no RoleBinding for agents
- **AND** the user lists agents
- **THEN** the impersonated call returns 403
- **AND** the API retries using the ark-api service account
- **AND** the response includes header `X-Ark-Impersonation-Fallback: true`
- **AND** a WARNING log entry is emitted with bob's identity and the denied action

#### Scenario: Fallback disabled, impersonated call fails
- **WHEN** `IMPERSONATION_FALLBACK=false`
- **AND** user `bob@acme.com` has no RoleBinding for agents
- **AND** the user lists agents
- **THEN** the API returns a structured error response (see error propagation requirement)

### Requirement: Structured error responses for RBAC denials
When impersonation is enabled and fallback is disabled, K8s 403 Forbidden errors SHALL be returned to the client as structured JSON with HTTP 403.

The response SHALL include:
- `error`: `"impersonation_forbidden"`
- `detail`: Human-readable message explaining the denial and how to fix it
- `user`: The impersonated username
- `resource`: The K8s resource type (e.g., `agents`)
- `namespace`: The target namespace
- `action`: The attempted verb (e.g., `list`, `create`, `delete`)

#### Scenario: User cannot list agents
- **WHEN** impersonated user `bob@acme.com` attempts to list agents in namespace `team-a`
- **AND** K8s returns 403
- **THEN** the API responds with HTTP 403 and body:
  ```json
  {
    "error": "impersonation_forbidden",
    "detail": "User 'bob@acme.com' does not have permission to list agents in namespace 'team-a'. A cluster administrator needs to create a RoleBinding granting access.",
    "user": "bob@acme.com",
    "resource": "agents",
    "namespace": "team-a",
    "action": "list"
  }
  ```

#### Scenario: User cannot delete a model
- **WHEN** impersonated user `jane@acme.com` attempts to delete model `gpt-4` in namespace `prod`
- **AND** K8s returns 403
- **THEN** the API responds with HTTP 403 including `"action": "delete"`, `"resource": "models"`

### Requirement: Configurable OIDC claim mapping
The following environment variables SHALL control how JWT claims are mapped to K8s identity:

| Variable | Default | Description |
|----------|---------|-------------|
| `IMPERSONATION_ENABLED` | `false` | Enable/disable impersonation |
| `IMPERSONATION_FALLBACK` | `false` | Enable/disable fallback mode |
| `IMPERSONATION_USERNAME_CLAIM` | `email` | JWT claim for K8s username |
| `IMPERSONATION_GROUPS_CLAIM` | `groups` | JWT claim for K8s groups |
| `IMPERSONATION_PREFIX` | (empty) | Prefix for username and group values |

#### Scenario: Azure Entra ID configuration
- **WHEN** `IMPERSONATION_USERNAME_CLAIM=preferred_username` and `IMPERSONATION_GROUPS_CLAIM=groups`
- **AND** a JWT contains `{"preferred_username": "jane@contoso.com", "groups": ["abc-123-uuid"]}`
- **THEN** `Impersonate-User: jane@contoso.com`
- **AND** `Impersonate-Group: abc-123-uuid`

#### Scenario: Keycloak with roles
- **WHEN** `IMPERSONATION_USERNAME_CLAIM=email` and `IMPERSONATION_GROUPS_CLAIM=realm_access.roles`
- **AND** a JWT contains `{"email": "jane@acme.com", "realm_access": {"roles": ["admin", "user"]}}`
- **THEN** `Impersonate-User: jane@acme.com`
- **AND** `Impersonate-Group: admin` and `Impersonate-Group: user`

#### Scenario: Nested claim path
- **WHEN** a claim path contains dots (e.g., `realm_access.roles`)
- **THEN** the system traverses the JWT payload as a nested path
- **AND** extracts the value at the leaf

### Requirement: Helm chart configuration
The ark-api Helm chart SHALL expose impersonation settings in `values.yaml` and inject them as environment variables into the deployment.

#### Scenario: Default values
- **WHEN** the chart is deployed with defaults
- **THEN** `IMPERSONATION_ENABLED` is `false`
- **AND** no impersonation RBAC is created for the ark-api service account

#### Scenario: Impersonation enabled via Helm values
- **WHEN** `impersonation.enabled: true` is set in values
- **THEN** `IMPERSONATION_ENABLED=true` is injected into the deployment
- **AND** impersonation RBAC rules are added to the ark-api Role
