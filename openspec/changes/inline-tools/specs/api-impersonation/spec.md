## MODIFIED Requirements

### Requirement: Impersonation feature flag

Impersonation SHALL be controlled by `IMPERSONATION_ENABLED` (default `false`). When disabled, JWT claims SHALL still be extracted to `request.state.user_identity`, but ordinary Kubernetes calls SHALL use ark-api's service account without impersonation headers.

Inline Tool authoring is an exception to that ordinary service-account path: create and spec-update operations through typed Tool or generic resource endpoints SHALL require enabled impersonation and an authenticated end-user identity. The API SHALL reject API-key-only or non-impersonated inline authoring rather than persist executable code under its shared service account. Update checks SHALL consider both stored and submitted resources; inline/non-inline conversions SHALL follow the inline-tools admission contract. Other operations SHALL retain their existing behavior.

#### Scenario: Impersonation disabled for ordinary operations

- **WHEN** `IMPERSONATION_ENABLED=false` and an SSO user makes a non-inline-authoring request
- **THEN** Kubernetes calls SHALL use ark-api's service account
- **AND** the user's JWT claims SHALL remain available on `request.state.user_identity`

#### Scenario: Impersonation enabled

- **WHEN** impersonation is enabled and an authenticated SSO user makes a request
- **THEN** Kubernetes calls SHALL include the mapped user/group impersonation headers

#### Scenario: API-key authentication for ordinary operations

- **WHEN** a request uses API-key authentication and is not inline authoring
- **THEN** it SHALL retain the existing non-impersonated service-account behavior

#### Scenario: Inline authoring requires identity

- **WHEN** an inline create/spec-update request has impersonation disabled, lacks an authenticated user identity, or uses API-key authentication alone
- **THEN** the API SHALL reject it without writing the Tool
- **AND** the same restriction SHALL apply to generic resource create/replace routes

#### Scenario: Authorized inline authoring

- **WHEN** a valid inline create/spec-update request has enabled impersonation and an authenticated user identity
- **THEN** it SHALL reach backend admission as that user
- **AND** the inline author permission SHALL be checked in the server-validated namespace

### Requirement: Fallback mode

When `IMPERSONATION_FALLBACK=true` and `IMPERSONATION_ENABLED=true`, ordinary requests SHALL attempt impersonated Kubernetes calls and MAY retry a Kubernetes 403 using ark-api's service account as specified by the existing fallback behavior. On fallback, the API SHALL log a warning with username, resource, namespace, and action and add `X-Ark-Impersonation-Fallback: true`.

Inline authoring requests SHALL NOT use this fallback. A denied inline create/spec-update SHALL return the denial without retrying under another identity, regardless of general fallback configuration. This restriction SHALL cover both typed Tool and generic resource write paths without changing fallback for other operations.

#### Scenario: Impersonated call succeeds

- **WHEN** fallback is enabled and an impersonated ordinary request succeeds
- **THEN** no fallback retry SHALL occur and no fallback header SHALL be present

#### Scenario: Ordinary impersonated call fails and fallback succeeds

- **WHEN** fallback is enabled and an ordinary impersonated request is denied with 403
- **THEN** the API SHALL retry using its service account
- **AND** a successful fallback SHALL include the fallback header and a warning log

#### Scenario: Fallback disabled

- **WHEN** fallback is disabled and an impersonated request is denied
- **THEN** the API SHALL return the existing structured error without a service-account retry

#### Scenario: Inline denial cannot fall back

- **GIVEN** general fallback is enabled and ark-api's service account has broader permissions than the requesting user
- **WHEN** an impersonated inline authoring request is denied
- **THEN** the API SHALL return the denial without a service-account retry or fallback-success header
