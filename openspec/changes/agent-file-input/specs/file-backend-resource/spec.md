## ADDED Requirements

### Requirement: FileBackend CRD represents a provider-side projection service

A new namespaced CRD `filebackends.ark.mckinsey.com` SHALL be defined. The CR's spec SHALL include:

- `provider` (string, required): the AI provider this backend serves (e.g., "openai", "anthropic", "bedrock", "azure"). Matches `Model.spec.provider` for implicit matching.
- `address` (ValueSource, required): reference to the service implementing the FileBackend HTTP contract.
- `constraints` (object, optional): advisory metadata advertising backend capabilities (max file size, accepted MIME types, free-form notes).

The CR's status SHALL include a `Ready` condition reflecting both service reachability and workspace dependency.

#### Scenario: Valid FileBackend CR accepted

- **WHEN** a `FileBackend` is created with `spec.provider: "openai"` and a resolvable `address`
- **THEN** the webhook SHALL accept the resource
- **AND** the controller SHALL reconcile its `status.conditions[Ready]`

#### Scenario: FileBackend without provider rejected

- **WHEN** a `FileBackend` is created without `spec.provider`
- **THEN** the webhook SHALL reject the resource

#### Scenario: FileBackend constraints exposed via API

- **WHEN** a `FileBackend` has `spec.constraints.maxFileBytes: 52428800`
- **AND** a caller queries the file listing endpoint
- **THEN** the per-backend compatibility section SHALL reflect this limit

### Requirement: At most one FileBackend per (namespace, provider)

A validating webhook SHALL reject creation of a second `FileBackend` with the same `spec.provider` in a namespace that already has one. The error message SHALL name the existing FileBackend and suggest using `Model.spec.fileBackend` for per-Model overrides.

#### Scenario: Duplicate provider rejected

- **WHEN** a namespace contains a `FileBackend` with `spec.provider: "openai"` named "primary"
- **AND** a user creates a second `FileBackend` with `spec.provider: "openai"`
- **THEN** the webhook SHALL reject the request with an error referencing "primary"

#### Scenario: Different providers coexist

- **WHEN** a namespace contains FileBackends for `openai` and `bedrock` independently
- **THEN** the webhook SHALL accept both
- **AND** both SHALL be discoverable by listing endpoints

### Requirement: Model.spec.fileBackend escape hatch

The `Model` CRD SHALL gain an optional `spec.fileBackend` field referencing a FileBackend by name. When present, the controller SHALL use the named FileBackend for files attached to Queries targeting that Model, taking precedence over implicit provider-based matching.

#### Scenario: Override resolves to named backend

- **WHEN** a Model has `spec.fileBackend.name: "experimental-openai"`
- **AND** a Query attaches a file and targets that Model
- **THEN** the controller SHALL invoke "experimental-openai" for projection
- **AND** SHALL NOT use any default provider-matched backend

#### Scenario: Override pointing at missing FileBackend fails

- **WHEN** a Model references a `fileBackend.name` that does not exist
- **AND** a Query targets that Model with attached files
- **THEN** the Query SHALL be rejected with a status condition naming the missing FileBackend

### Requirement: FileBackend HTTP contract

A service referenced by a `FileBackend` CR SHALL expose the following endpoints:

- `POST /v1/projections` — body `{ workspace_uri, etag, mime, credentials: {...}, target_api?: "<surface>" }`. Projects the workspace file to the provider, caches the result, returns a `{ provider_file_id, expires_at, part }` envelope where `part` is the provider-native message-part shape ready to substitute for the FilePart in the dispatched message.
- `GET /v1/projections?workspace_uri=<uri>&etag=<e>` — returns cached projection if present, else 404.
- `DELETE /v1/projections/<id>` — invalidates the cache entry and best-effort deletes the provider-side file.
- `GET /v1/capabilities` — static metadata: accepted MIME types (grouped by category if useful), size limits, account-fingerprint behavior, supported API surfaces, notes. Used by ark-api to populate `compatibility` in list responses.

The FileBackend SHALL handle MIME-aware part-type selection inside the projection response. The controller SHALL NOT contain provider-specific part-type knowledge; it substitutes the returned `part` envelope verbatim.

Credentials SHALL be passed in-band with each projection request, sourced from the Model's resolved configuration; FileBackend services SHALL NOT store credentials in their own spec.

#### Scenario: Document projection returns input_file part

- **WHEN** ark-api POSTs `/v1/projections` for a PDF or other document MIME
- **THEN** the backend SHALL upload the bytes to the provider
- **AND** SHALL store the (uri, etag, account_fingerprint) → provider_file_id mapping
- **AND** SHALL return a `part` envelope appropriate to documents (e.g., `{ type: "input_file", file_id: "..." }` for Responses, or `{ type: "file", file: { file_id: "..." } }` for Chat Completions)

#### Scenario: Image projection returns image part

- **WHEN** ark-api POSTs `/v1/projections` for an image MIME (image/png, image/jpeg, image/gif, image/webp)
- **THEN** the backend SHALL produce an image-shaped `part` envelope appropriate to the target API surface (e.g., `{ type: "image_url", image_url: { url: "..." } }` for Chat Completions, or `{ type: "input_image", file_id: "..." }` for Responses)
- **AND** the backend MAY choose between hosted reference (file_id) and inline data URL based on file size and configured policy

#### Scenario: Cached projection returned without re-upload

- **WHEN** ark-api requests a projection for a `(uri, etag, account_fingerprint)` already cached
- **THEN** the backend SHALL return the cached `provider_file_id` and the cached `part` envelope
- **AND** SHALL NOT re-upload to the provider

#### Scenario: Capabilities advertised

- **WHEN** ark-api calls `GET /v1/capabilities`
- **THEN** the backend SHALL return JSON listing `acceptedMimeTypes`, `maxFileBytes`, supported `targetApis`, and any free-form `notes`

### Requirement: FileBackend cache keyed by workspace URI, etag, and account fingerprint

The FileBackend cache key SHALL be the tuple `(workspace_uri, etag, account_fingerprint)`. The account fingerprint SHALL be a stable, non-reversible hash of the credentials passed in by the caller (e.g., based on baseUrl + apiKey reference identity), ensuring files projected with one set of credentials are not reused under another.

#### Scenario: Different credentials cause separate projection

- **WHEN** a workspace file is projected by ark-api using credentials A, returning `file_id_A`
- **AND** the same file is projected using credentials B (different account)
- **THEN** the backend SHALL upload again
- **AND** SHALL return a distinct `file_id_B` not equal to `file_id_A`

#### Scenario: Overwrite changes etag and forces re-projection

- **WHEN** a workspace file is overwritten with new bytes (etag changes)
- **AND** ark-api requests a projection for the new etag
- **THEN** the backend SHALL upload the new bytes
- **AND** SHALL return a new `provider_file_id`
- **AND** SHALL evict the previous etag's cache entry
- **AND** SHALL best-effort delete the previous provider-side file

### Requirement: FileBackend reports workspace dependency in status

The controller SHALL reconcile `FileBackend.status.conditions[Ready]`. If no `Workspace` CR exists in the same namespace, `Ready` SHALL be `False` with reason `NoWorkspace` and a message directing the user to install a workspace implementation.

#### Scenario: FileBackend installed without Workspace shows NoWorkspace

- **WHEN** a `FileBackend` exists in a namespace that has no `Workspace` CR
- **AND** ark-api's built-in default workspace is NOT considered for the purposes of this condition
- **THEN** the controller SHALL set `FileBackend.status.conditions[Ready]=False`
- **AND** the reason SHALL be `NoWorkspace`
- **AND** the message SHALL reference marketplace install guidance

(Note: The Ready condition tracks dependency on an externally-installed Workspace. The built-in default workspace lets `/v1/files` operate functionally, but FileBackend Ready=True requires a real Workspace CR — this is intentional so the condition acts as an "is the install complete" signal.)

#### Scenario: Workspace creation flips FileBackend to Ready

- **WHEN** a `Workspace` CR is created in a namespace that contained only a `FileBackend`
- **THEN** within the reconciler's poll interval, the FileBackend's `Ready` condition SHALL flip to `True`

### Requirement: Listing endpoint exposes per-backend compatibility and projection state

ark-api's `GET /v1/files` and `GET /v1/files/<path>` responses SHALL include both a static `compatibility` map (derived from each installed FileBackend's `spec.constraints` + `/v1/capabilities`) and a dynamic `projections` map (derived from each backend's cached state).

#### Scenario: Listing reflects per-backend acceptance

- **WHEN** a workspace contains `report.xlsx`
- **AND** an `openai` FileBackend advertises that it accepts spreadsheet types
- **AND** a `bedrock` FileBackend does not
- **THEN** the listing entry for `report.xlsx` SHALL include `compatibility.openai: "accepted"` and `compatibility.bedrock: "not-supported"`

#### Scenario: Projection state reflects cache

- **WHEN** an OpenAI FileBackend has cached a projection of `report.pdf`
- **AND** Bedrock FileBackend has not
- **THEN** the listing SHALL include `projections.openai.status: "ready"`
- **AND** `projections.bedrock` SHALL be absent or `"not-projected"`
