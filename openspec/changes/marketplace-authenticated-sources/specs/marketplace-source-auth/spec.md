## ADDED Requirements

### Requirement: Fetch marketplace sources that require authentication

ark-api SHALL attach an `Authorization` header when fetching a source that has an associated credential, supporting both **bearer/token** (`Authorization: token <value>`) and **HTTP Basic** (`Authorization: Basic base64(":<value>")`) schemes, selectable per source. Sources without a credential SHALL be fetched anonymously, exactly as before.

#### Scenario: Bearer-authenticated source

- **WHEN** a source has a credential configured with the bearer/token scheme
- **THEN** ark-api fetches its manifest with `Authorization: token <value>` and the items load

#### Scenario: HTTP Basic source (Azure DevOps)

- **WHEN** a source has a credential configured with the basic scheme
- **THEN** ark-api fetches its manifest with `Authorization: Basic base64(":<value>")` (empty username, credential as password)

#### Scenario: Anonymous source unchanged

- **WHEN** a source has no credential
- **THEN** ark-api fetches it with no `Authorization` header, exactly as today

### Requirement: Store credentials in a Kubernetes Secret, never exposed to the client

A source credential SHALL be stored in a Kubernetes Secret — never in the `marketplace-sources` ConfigMap and never in the browser. The credential value SHALL NOT be returned in any API response and SHALL NOT be written to logs.

#### Scenario: Credential never echoed back

- **WHEN** a client lists or gets a source that has a credential
- **THEN** the response exposes at most a flag/reference indicating a credential is set, never the credential value

#### Scenario: Credential never logged

- **WHEN** a source is created or updated with a credential, or a credentialed fetch runs
- **THEN** the credential value does not appear in any server log (request body, header, or error)

### Requirement: Read credentials under the calling user's identity

ark-api SHALL read a source's credential Secret using the requesting user's impersonated identity, not its own Service Account, so a user cannot use a credential they are not authorized to read.

#### Scenario: User without Secret access cannot borrow the credential

- **WHEN** a user who lacks RBAC to read a source's credential Secret triggers a fetch of that source
- **THEN** ark-api does not fetch with the credential and the source reports an authorization error — the credential is never used on that user's behalf

#### Scenario: Authorized user resolves the source

- **WHEN** a user with RBAC to read the credential Secret loads the catalogue
- **THEN** the authenticated source resolves and its items load

### Requirement: Validate an authenticated source before saving

When a source is created or updated with a credential, ark-api SHALL verify the manifest is reachable with that credential before persisting, and SHALL reject the save with a clear error if the credential is missing or rejected.

#### Scenario: Valid credential saves

- **WHEN** a user adds a private source with a working credential
- **THEN** validation fetches the manifest successfully and the source is saved

#### Scenario: Rejected credential blocks the save

- **WHEN** a user adds a private source with a missing or invalid credential
- **THEN** the save is rejected with a clear error and nothing is persisted

### Requirement: Surface authentication failures in the UI

When a source fetch fails because of authentication (HTTP 401/403), the dashboard SHALL show a clear per-source error rather than silently dropping the items from the grid.

#### Scenario: Auth failure is visible

- **WHEN** an authenticated source returns 401/403 at fetch time
- **THEN** the dashboard shows a clear error for that source (e.g. "authentication failed") instead of an empty grid with no explanation

### Requirement: Do not leak credentials on redirect

ark-api SHALL NOT follow redirects when fetching a credentialed source, and SHALL NOT send the `Authorization` header to any host other than the configured source host.

#### Scenario: Redirected credentialed fetch does not forward the header

- **WHEN** a credentialed source responds with a redirect to a different host
- **THEN** ark-api does not follow the redirect and does not send the credential to the redirect target; the source reports an error

### Requirement: Re-enter the credential when the source URL changes

When a source's URL is changed, the dashboard SHALL require the credential to be re-entered rather than silently reusing the existing Secret against the new URL.

#### Scenario: Changing the URL requires re-supplying the credential

- **WHEN** a user edits an authenticated source to point at a different URL
- **THEN** the existing credential is not automatically reused for the new URL; the user must re-supply it before saving

### Requirement: Preserve the SSRF guard for credentialed fetches

The existing non-routable-host guard SHALL apply to credentialed fetches: requests resolving to loopback, link-local (including cloud metadata endpoints such as `169.254.169.254`), multicast, reserved, or unspecified addresses SHALL be rejected before any request is sent.

#### Scenario: Credentialed fetch to a blocked host

- **WHEN** a source resolves to a non-routable host such as the cloud metadata endpoint
- **THEN** ark-api rejects the fetch and sends no request (so the credential cannot be used to reach internal/metadata services)

### Requirement: Tie the credential Secret lifecycle to the source

The credential Secret SHALL be created and updated with its source and deleted when the source is deleted, leaving no orphaned credential Secrets.

#### Scenario: Deleting a source removes its credential

- **WHEN** a user deletes an authenticated source
- **THEN** its credential Secret is removed

#### Scenario: Removing the credential from a source

- **WHEN** a user edits an authenticated source to be anonymous (clears the credential)
- **THEN** the credential Secret is deleted and the source is fetched anonymously afterward
