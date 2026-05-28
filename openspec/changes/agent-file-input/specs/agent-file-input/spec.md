## ADDED Requirements

### Requirement: Query.spec.input accepts A2A FilePart with URI

The Query CRD's existing `spec.input` field (a `RawExtension`) SHALL be documented to accept an array of A2A-shaped message parts including `FilePart` entries that carry a `uri` field referencing a workspace file. No CRD schema change is required.

A FilePart in Query input SHALL have the shape `{ kind: "file", uri: "ark://workspace/<path>", mimeType?: "<type>" }`. The mime type, if present, is advisory; the authoritative MIME is the workspace's stored value.

#### Scenario: Query with text and file parts accepted

- **WHEN** a Query is created with `spec.input: { parts: [{ kind: "text", text: "summarise" }, { kind: "file", uri: "ark://workspace/report.pdf" }] }`
- **THEN** the controller SHALL accept the Query
- **AND** dispatch SHALL invoke the projection step for the FilePart

#### Scenario: Query with FilePart targeting non-existent workspace file rejected

- **WHEN** a Query references `ark://workspace/missing.pdf`
- **AND** the workspace returns 404 for that path
- **THEN** the Query SHALL be rejected with a status condition naming the missing URI

### Requirement: Controller projects FileParts to provider-native parts at dispatch

When dispatching a Query that contains one or more FileParts, the controller SHALL:

1. Resolve the target's effective Model (via Agent, Team member, or direct target).
2. Identify the FileBackend to use: either `Model.spec.fileBackend` if set, or the namespace's FileBackend with matching `spec.provider`.
3. For each FilePart, fetch the workspace etag and MIME type, then call the FileBackend's `/v1/projections` (passing the Model's resolved credentials and the MIME type).
4. Substitute the FilePart in the message sent to the executor with the `part` envelope returned by the FileBackend.

Executors SHALL receive only translated, provider-native parts; executors SHALL NOT see workspace URIs. The controller SHALL be MIME-agnostic; the FileBackend is responsible for choosing the right part type (input_file, image_url, input_image, etc.) for the file's MIME and target API surface.

#### Scenario: Document FilePart projected and forwarded as input_file

- **WHEN** a Query carries one FilePart referencing a PDF and targets an Agent using an OpenAI-provider Model
- **AND** an `openai` FileBackend is installed in the namespace
- **THEN** the controller SHALL call the FileBackend's `/v1/projections` with the workspace URI, MIME type, and the Model's credentials
- **AND** the executor SHALL receive the document part envelope returned by the FileBackend

#### Scenario: Image FilePart projected as image part

- **WHEN** a Query carries one FilePart referencing an image (image/png, image/jpeg, etc.) and targets an Agent using a vision-capable OpenAI Model
- **AND** an `openai` FileBackend is installed in the namespace
- **THEN** the controller SHALL call the FileBackend's `/v1/projections` with the image MIME type
- **AND** the executor SHALL receive an image-shaped part (image_url or input_image, per the backend's choice) — NOT an input_file part

#### Scenario: Image attached to a non-vision Model

- **WHEN** a Query carries an image FilePart and targets a Model that does not support image input
- **THEN** the projection step SHALL succeed (the file is uploaded; the FileBackend does not know which Model will consume it)
- **AND** the executor's call to the LLM provider SHALL surface the provider's "unsupported input" error
- **AND** the Query SHALL transition to Error phase with the underlying error in its status condition

#### Scenario: Multiple FileParts projected in parallel

- **WHEN** a Query carries three FileParts of mixed types (document and image)
- **THEN** the controller MAY call the FileBackend concurrently for the three parts
- **AND** all three SHALL appear as provider-native parts in the dispatched message before the executor is invoked
- **AND** each part SHALL have the type appropriate to its MIME (input_file or image_url/input_image)

### Requirement: Projection failure rejects the Query loudly

If projection cannot be completed for any FilePart in a Query, the Query SHALL be rejected with a clear status condition. The condition SHALL identify which FilePart failed, which FileBackend was tried, and the underlying error.

The controller SHALL NOT fall back to inline base64 content (#1835 is a separate code path). The controller SHALL NOT silently skip files.

#### Scenario: No FileBackend for Model's provider

- **WHEN** a Query references a FilePart and targets a Model with `spec.provider: "anthropic"`
- **AND** no FileBackend with `spec.provider: "anthropic"` is installed in the namespace
- **AND** the Model has no `spec.fileBackend` override
- **THEN** the Query SHALL be rejected with status condition `FileBackendUnavailable`
- **AND** the message SHALL name the missing provider

#### Scenario: FileBackend service unhealthy

- **WHEN** the matched FileBackend service returns 5xx
- **THEN** the Query SHALL be rejected with status condition `ProjectionFailed`
- **AND** the message SHALL include the backend name and underlying error

#### Scenario: File type not supported by backend

- **WHEN** a FileBackend rejects the projection request because the MIME type is not in its accepted list
- **THEN** the Query SHALL be rejected with status condition `ProjectionFailed`
- **AND** the message SHALL identify the unsupported MIME type

### Requirement: Memory preserves FileParts faithfully across turns

The ark-broker memory storage SHALL preserve FileParts in their workspace-URI form when recording user messages. Replay of conversation history SHALL yield FileParts identical in shape to those originally submitted.

#### Scenario: FilePart survives memory round-trip

- **WHEN** a Query is dispatched with a FilePart referencing `ark://workspace/report.pdf`
- **AND** the memory broker records the user message
- **AND** a subsequent Query in the same conversation triggers history replay
- **THEN** the replayed history SHALL contain the FilePart with its original URI

#### Scenario: Session inherits attachments via replay

- **WHEN** a multi-turn conversation has FileParts attached on turn 1
- **AND** turn 2 sends a new user message without re-attaching the files
- **THEN** the controller SHALL re-project the FileParts from turn 1's replayed history
- **AND** the executor SHALL receive turn 2's message with provider-native parts representing both turn 1's files and turn 2's text

#### Scenario: Provider switch mid-session re-projects

- **WHEN** a conversation's first turn targets an OpenAI-backed Agent and projects a FilePart to OpenAI
- **AND** the second turn targets a Bedrock-backed Agent in the same conversation
- **THEN** the controller SHALL call the Bedrock FileBackend with the same workspace URI
- **AND** the executor SHALL receive Bedrock-native parts

### Requirement: ark-api exposes /v1/files endpoints

ark-api SHALL expose the following endpoints under `/v1/files`. All endpoints SHALL be namespace-scoped to the caller's identity via `ImpersonationConfig`.

- `POST /v1/files` — multipart upload (fields: `file`, `prefix`, `prewarm`). Returns `{ uri, path, etag, size, mime, uploaded_at, compatibility, projections }`.
- `GET /v1/files` — stitched list (workspace files + per-backend compatibility + per-backend projection state).
- `GET /v1/files/<path>` — single-file metadata, same envelope.
- `GET /v1/files/<path>/content` — stream bytes.
- `DELETE /v1/files/<path>` — delete with backend fanout.
- `POST /v1/files/<path>/prewarm` — synchronous prewarm request (body `{ provider }`).

#### Scenario: Upload returns canonical URI and projection state

- **WHEN** a caller POSTs to `/v1/files` with `file=report.pdf` and `prewarm=openai`
- **THEN** ark-api SHALL store the file via the workspace
- **AND** SHALL fire a best-effort `/v1/projections` call to the openai FileBackend
- **AND** SHALL return `uri: "ark://workspace/report.pdf"` and `projections.openai.status: "pending"`

#### Scenario: List returns stitched view

- **WHEN** a caller GETs `/v1/files`
- **THEN** the response SHALL include each workspace file with `compatibility` and `projections` populated from each installed FileBackend

#### Scenario: Delete fans out to FileBackends

- **WHEN** a caller DELETEs `/v1/files/report.pdf`
- **THEN** ark-api SHALL call the workspace's delete endpoint
- **AND** SHALL fire best-effort delete requests to every installed FileBackend
- **AND** SHALL return success even if individual backend deletes fail
- **AND** SHALL include a `projections_cleaned` summary in the response

#### Scenario: Prewarm endpoint waits for projection

- **WHEN** a caller POSTs to `/v1/files/report.pdf/prewarm` with `{ "provider": "openai" }`
- **AND** the openai FileBackend is installed
- **THEN** ark-api SHALL call the FileBackend synchronously
- **AND** SHALL return the updated projection entry when projection completes

### Requirement: Upload supports hint-based prewarm

The `prewarm` form field on `POST /v1/files`, when set to a provider name, SHALL trigger a best-effort projection call to the matching FileBackend after the workspace upload completes. The upload response SHALL NOT block on prewarm completion.

#### Scenario: Prewarm with matching backend installed

- **WHEN** a caller uploads with `prewarm=openai`
- **AND** an `openai` FileBackend is installed
- **THEN** ark-api SHALL return success immediately after the workspace upload
- **AND** SHALL initiate the projection call without blocking the response
- **AND** the projection state SHALL appear as "ready" in a subsequent listing once complete

#### Scenario: Prewarm for missing backend silently noop

- **WHEN** a caller uploads with `prewarm=anthropic`
- **AND** no `anthropic` FileBackend is installed
- **THEN** ark-api SHALL accept the upload normally
- **AND** SHALL NOT fail the upload
- **AND** SHALL NOT include an anthropic entry in the response's `projections` block

### Requirement: ark-api enforces RBAC via workspaces/files subresource

ark-api SHALL gate every `/v1/files` route via a SubjectAccessReview against the `workspaces/files` subresource:

- LIST/GET → `GET` on `workspaces/files`
- POST (upload) → `CREATE` on `workspaces/files`
- DELETE → `DELETE` on `workspaces/files`
- POST (prewarm) → `CREATE` on `workspaces/files` AND `GET` on `filebackends`

A bundled ClusterRole `ark-workspace-user` SHALL grant all four verbs. The role is intended for namespace-bound RoleBinding by cluster operators.

#### Scenario: Caller without permission rejected

- **WHEN** a caller without `GET` on `workspaces/files` requests `GET /v1/files`
- **THEN** ark-api SHALL return HTTP 403

#### Scenario: Read-only caller cannot upload

- **WHEN** a caller has `GET` on `workspaces/files` but not `CREATE`
- **AND** the caller POSTs to `/v1/files`
- **THEN** ark-api SHALL return HTTP 403

### Requirement: Overwrite replaces bytes and invalidates projections

When a caller uploads a file to a path that already exists, ark-api SHALL forward the upload to the workspace, which SHALL replace the stored bytes and return a new etag. FileBackend caches keyed by the previous etag become stale; backends SHALL re-project on next request and best-effort delete the prior provider-side file.

#### Scenario: Overwrite returns new etag

- **WHEN** `report.pdf` exists with etag "a"
- **AND** a caller uploads new bytes to the same path
- **THEN** the response SHALL include a new etag distinct from "a"

#### Scenario: Mid-conversation overwrite uses new bytes on next turn

- **WHEN** a multi-turn conversation has projected `report.pdf` (etag "a")
- **AND** between turns, the file is overwritten (new etag "b")
- **AND** the next turn replays history including the FilePart for `report.pdf`
- **THEN** the controller SHALL fetch etag "b"
- **AND** SHALL request a fresh projection from the FileBackend
- **AND** the executor SHALL receive a part referencing the new bytes

### Requirement: Dashboard chat composer surfaces attach affordance

The Ark Dashboard chat composer SHALL include an attach affordance that allows users to (a) pick from existing workspace files, or (b) upload a new file inline. Files attached this way SHALL appear in the message input as pills before sending. When the active agent's Model provider is known, uploads from the composer SHALL request prewarm for that provider.

When no `Workspace` is available (and built-in default is disabled or out of capacity), the attach affordance SHALL be hidden with explanatory help text.

#### Scenario: Composer picks existing file

- **WHEN** the user clicks the attach affordance and selects "From workspace"
- **THEN** the picker SHALL list the namespace's workspace files
- **AND** selecting one SHALL add a pill to the composer

#### Scenario: Composer uploads new file with prewarm

- **WHEN** the user clicks the attach affordance and uploads `report.pdf`
- **AND** the active agent's Model has `spec.provider: "openai"`
- **THEN** the dashboard SHALL POST to `/v1/files` with `prewarm=openai`
- **AND** SHALL show a pill referencing the new file in the composer

#### Scenario: No workspace hides attach affordance

- **WHEN** the namespace has no Workspace CR
- **AND** the built-in default workspace is unavailable
- **THEN** the dashboard SHALL hide the attach affordance
- **AND** SHALL show explanatory text linking to marketplace install guidance
