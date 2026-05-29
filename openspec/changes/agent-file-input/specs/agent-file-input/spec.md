## ADDED Requirements

### Requirement: Query.spec.input accepts `ark.file` content parts inside user messages

The Query CRD's existing `spec.input` field (a `RawExtension`) SHALL be documented to accept user messages whose `content` array includes `ark.file` content parts referencing a workspace file. No CRD schema change is required. The content array is the standard OpenAI-shaped polymorphic content; `ark.file` is a custom part type that lives alongside `text`, `image_url`, `input_file`, etc.

An `ark.file` content part SHALL have the shape `{ "type": "ark.file", "uri": "ark://workspace/<path>", "mime"?: "<type>" }`. The `mime`, if present, is advisory; the authoritative MIME is the workspace's stored value at projection time.

#### Scenario: Query with text and ark.file content parts accepted

- **WHEN** a Query is created with `spec.input` containing a user message with `content: [{ "type": "text", "text": "summarise" }, { "type": "ark.file", "uri": "ark://workspace/report.pdf" }]`
- **THEN** the controller SHALL accept the Query
- **AND** dispatch SHALL invoke the projection step for the `ark.file` part

#### Scenario: Query with ark.file targeting non-existent workspace file rejected

- **WHEN** a Query references `ark://workspace/missing.pdf`
- **AND** the workspace returns 404 for that path
- **THEN** the Query SHALL be rejected with a status condition naming the missing URI

### Requirement: Controller is the sole translator; covers new input AND replayed history

When dispatching a Query, the controller SHALL:

1. Write the new user message (with any `ark.file` content parts intact) to the memory broker for the Query's `conversationId`.
2. Read the full conversation history for that `conversationId` from the memory broker.
3. Resolve the target's effective Model (via Agent, Team member, or direct target).
4. Identify the FileBackend to use: `Model.spec.fileBackend` if set, otherwise the namespace's FileBackend with matching `spec.provider`.
5. Walk every message in the read stream; for each `ark.file` content part, fetch the workspace etag and MIME via the Workspace HTTP contract, then call the FileBackend's `POST /v1/projections` passing the workspace URI, etag, mime, and a `model_ref` (namespace + name) — NOT credential values.
6. Substitute each `ark.file` content part in the message stream with the `part` envelope returned by the FileBackend.
7. Send the fully-projected message stream to the executor via A2A (including history as the A2A Task's `history` field).

Executors SHALL receive only translated, provider-native parts in the dispatched message stream; executors SHALL NOT see `ark.file` parts or workspace URIs from any source. The controller SHALL NOT contain provider-specific part-type knowledge; it substitutes the FileBackend's `part` envelope verbatim.

The controller SHALL project only `ark.file` content parts that are referenced in the conversation's history. The controller SHALL NOT enumerate the workspace or project unreferenced files; projection scope is bounded by what the conversation actually attached, never by what the workspace contains.

The controller MAY perform projection calls concurrently within a single dispatch.

#### Scenario: Document `ark.file` projected and forwarded as input_file

- **WHEN** a Query carries one `ark.file` content part referencing a PDF and targets an Agent using an OpenAI-provider Model
- **AND** an `openai` FileBackend is installed in the namespace
- **THEN** the controller SHALL call the FileBackend's `/v1/projections` with the workspace URI, MIME, and a `model_ref` to the target Model
- **AND** the executor SHALL receive the document part envelope returned by the FileBackend in the dispatched message stream

#### Scenario: Image `ark.file` projected as image part

- **WHEN** a Query carries one `ark.file` content part referencing an image (image/png, image/jpeg, etc.) and targets an Agent using a vision-capable OpenAI Model
- **AND** an `openai` FileBackend is installed in the namespace
- **THEN** the controller SHALL call the FileBackend's `/v1/projections` with the image MIME
- **AND** the executor SHALL receive an image-shaped part (image_url or input_image, per the backend's choice) — NOT an input_file part

#### Scenario: Image attached to a non-vision Model

- **WHEN** a Query carries an image `ark.file` and targets a Model that does not support image input
- **THEN** the projection step SHALL succeed (the file is uploaded; the FileBackend does not know which Model will consume it)
- **AND** the executor's call to the LLM provider SHALL surface the provider's "unsupported input" error
- **AND** the Query SHALL transition to Error phase with the underlying error in its status condition

#### Scenario: Projection scope is conversation-bounded

- **WHEN** a workspace contains 1000 files and a Query attaches only `report.pdf`
- **THEN** the controller SHALL call the FileBackend at most once for `report.pdf` during dispatch
- **AND** SHALL NOT call the FileBackend for any other workspace file

#### Scenario: Multiple `ark.file` parts in one dispatch projected concurrently

- **WHEN** a Query's history contains three `ark.file` parts (a mix of documents and images)
- **THEN** the controller MAY call the FileBackend concurrently for the three parts
- **AND** all three SHALL appear as provider-native parts in the dispatched message before the executor is invoked
- **AND** each part SHALL have the type appropriate to its MIME

#### Scenario: Credentials are not transmitted to the FileBackend

- **WHEN** the controller calls the FileBackend's `/v1/projections`
- **THEN** the request body SHALL contain `model_ref` (namespace + name) but SHALL NOT contain the resolved apiKey value or any other secret value
- **AND** the FileBackend SHALL resolve credentials from the Model CR itself using its own K8s API access

### Requirement: Projection failure rejects the Query loudly

If projection cannot be completed for any `ark.file` part in a Query, the Query SHALL be rejected with a clear status condition. The condition SHALL identify which part failed (workspace URI), which FileBackend was tried, and the underlying error.

The controller SHALL NOT fall back to inline base64 content (#1835 is a separate code path). The controller SHALL NOT silently skip files.

#### Scenario: No FileBackend for Model's provider

- **WHEN** a Query references an `ark.file` and targets a Model with `spec.provider: "anthropic"`
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

### Requirement: Memory preserves `ark.file` content parts across turns

The ark-broker memory storage SHALL preserve `ark.file` content parts in their workspace-URI form when recording user messages. The broker's storage contract is unchanged (`Message = unknown`); the `ark.file` part lives inside the existing OpenAI-shaped message content array as a polymorphic part type.

The controller SHALL write new user messages (with `ark.file` content parts intact, pre-projection) to memory before dispatch. The controller SHALL re-project `ark.file` parts when replaying history. The executor SHALL continue to write assistant and tool outputs to memory unchanged.

#### Scenario: `ark.file` content part survives memory round-trip

- **WHEN** a Query is dispatched with a user message containing `{ "type": "ark.file", "uri": "ark://workspace/report.pdf" }`
- **AND** the controller writes this user message to the memory broker
- **AND** a subsequent Query in the same conversation triggers history replay
- **THEN** the replayed history SHALL contain the `ark.file` content part with its original URI

#### Scenario: Session inherits attachments via replay

- **WHEN** a multi-turn conversation has an `ark.file` content part on turn 1's user message
- **AND** turn 2 sends a new user message without re-attaching the file
- **THEN** the controller SHALL re-project the `ark.file` from turn 1's replayed history
- **AND** the executor SHALL receive turn 2's dispatched message stream containing provider-native parts for turn 1's file alongside turn 2's text

#### Scenario: Provider switch mid-session re-projects

- **WHEN** a conversation's first turn targets an OpenAI-backed Agent and projects an `ark.file` to OpenAI
- **AND** the second turn targets a Bedrock-backed Agent in the same conversation (assuming a Bedrock FileBackend exists)
- **THEN** the controller SHALL call the Bedrock FileBackend with the same workspace URI
- **AND** the executor SHALL receive Bedrock-native parts in turn 2's dispatched message stream

#### Scenario: Cache hit on memory replay avoids re-upload

- **WHEN** a multi-turn conversation has projected `ark://workspace/report.pdf` to OpenAI org-A on turn 1
- **AND** turn 2 triggers history replay and re-projection of the same file
- **THEN** the FileBackend SHALL return the cached `provider_file_id` for `(uri, etag, destination_id=org-A)`
- **AND** SHALL NOT re-upload to OpenAI

#### Scenario: `ark.file` parts never reach an LLM provider

- **WHEN** the executor receives a dispatched message stream from the controller
- **THEN** the stream SHALL NOT contain any `ark.file` content parts
- **AND** the executor SHALL forward the stream to the LLM provider with provider-native parts only

### Requirement: ark-sdk exposes controller-supplied history as `request.history`

The ark-sdk's `ExecutionEngineRequest` SHALL include an optional `history: list[Message] = []` field. The SDK's `resolve_query()` SHALL populate this field with the controller-supplied conversation history (received via A2A) when the Query carries a `conversationId`. The field's contents SHALL already be fully projected — `ark.file` content parts replaced with provider-native parts.

Executor implementations MAY consume `request.history` directly when building LLM requests. Executors using provider-side conversation state (e.g., openai-responses' `previous_response_id`) MAY ignore the supplied history without violating this requirement.

#### Scenario: SDK populates `request.history` for multi-turn

- **WHEN** the controller dispatches a Query with `conversationId: "abc"` containing 3 prior messages plus a new user message
- **AND** the dispatch arrives at an external executor built on ark-sdk
- **THEN** the executor's `execute_agent()` SHALL receive a `request.history` list containing 3 entries (the prior turns, fully projected; `ark.file` parts replaced with provider-native parts)
- **AND** `request.userInput` SHALL contain the new user message (also fully projected)

#### Scenario: SDK leaves `request.history` empty for fresh conversations

- **WHEN** a Query is dispatched with no `conversationId`
- **THEN** `request.history` SHALL be `[]`
- **AND** the executor SHALL operate on `request.userInput` only

#### Scenario: Executor with provider-side state may ignore `request.history`

- **WHEN** an executor (e.g., openai-responses) uses a provider-supplied conversation mechanism such as `previous_response_id`
- **AND** receives a request with non-empty `request.history`
- **THEN** the executor MAY ignore `request.history` and continue to use its provider-side state mechanism
- **AND** this SHALL NOT violate the contract

### Requirement: ark-api exposes /v1/files endpoints

ark-api SHALL expose the following endpoints under `/v1/files`. All endpoints SHALL be namespace-scoped to the caller's identity via `ImpersonationConfig`.

- `POST /v1/files` — multipart upload (fields: `file`, `prefix`, `prewarm_model_ref?`, `prewarm_provider?`). Returns `{ uri, path, etag, size, mime, uploaded_at, compatibility, projections }`.
- `GET /v1/files?model_ref=<ns>/<name>` — stitched list (workspace files + per-backend compatibility + per-backend projection state). The optional `model_ref` query parameter scopes the `projections` block to that Model's destination; without it, the response shows provider-level rollup readiness (see below).
- `GET /v1/files/<path>?model_ref=<ns>/<name>` — single-file metadata; same envelope and same optional `model_ref` semantics.
- `GET /v1/files/<path>/content` — stream bytes.
- `DELETE /v1/files/<path>` — delete with backend fanout.
- `POST /v1/files/<path>/prewarm` — synchronous prewarm request. Body MAY include `model_ref: { namespace, name }` for an account-accurate prewarm, OR `provider: "<name>"` for a best-effort, provider-level prewarm. `model_ref` takes precedence when both are set.

#### Scenario: Upload returns canonical URI and projection state

- **WHEN** a caller POSTs to `/v1/files` with `file=report.pdf` and `prewarm_model_ref=team-a/gpt-4-prod`
- **THEN** ark-api SHALL store the file via the workspace
- **AND** SHALL fire a best-effort `/v1/projections` call to the FileBackend matched to that Model
- **AND** SHALL return `uri: "ark://workspace/report.pdf"` and a `projections` entry keyed by the resolved provider (e.g., `projections.openai.status: "pending"`) for the prewarmed destination

#### Scenario: List returns stitched view with provider-level rollup readiness

- **WHEN** a caller GETs `/v1/files` without a `model_ref` query parameter
- **THEN** the response SHALL include each workspace file with `compatibility` and `projections` populated from each installed FileBackend
- **AND** each `projections.<provider>.status` SHALL reflect provider-level rollup readiness — `"ready"` if at least one destination on that provider has projected the file, `"not-projected"` otherwise
- **AND** the response SHALL document this semantic (e.g., a `projections_scope: "provider-rollup"` field) so callers do not misread the badge as Query-specific

#### Scenario: List with `model_ref` returns destination-scoped readiness

- **WHEN** a caller GETs `/v1/files?model_ref=team-a/gpt-4-prod`
- **THEN** ark-api SHALL resolve the named Model to its FileBackend and `destination_id`
- **AND** the response's `projections` block SHALL reflect cache state for THAT destination only — `"ready"` only when the specific destination has the file cached
- **AND** the response SHALL include `projections_scope: "model"` and echo the resolved model_ref

#### Scenario: Delete fans out to FileBackends

- **WHEN** a caller DELETEs `/v1/files/report.pdf`
- **THEN** ark-api SHALL call the workspace's delete endpoint
- **AND** SHALL fire best-effort delete requests to every installed FileBackend
- **AND** SHALL return success even if individual backend deletes fail
- **AND** SHALL include a `projections_cleaned` summary in the response

#### Scenario: Prewarm endpoint with `model_ref` is destination-accurate

- **WHEN** a caller POSTs to `/v1/files/report.pdf/prewarm` with `{ "model_ref": { "namespace": "team-a", "name": "gpt-4-prod" } }`
- **THEN** ark-api SHALL resolve the Model to its FileBackend
- **AND** SHALL call the FileBackend synchronously with that `model_ref`
- **AND** SHALL return the updated projection entry when projection completes

#### Scenario: Prewarm endpoint with `provider` is best-effort

- **WHEN** a caller POSTs to `/v1/files/report.pdf/prewarm` with `{ "provider": "openai" }`
- **AND** the namespace has multiple Models with `spec.provider: "openai"` (different accounts)
- **THEN** ark-api SHALL select one such Model deterministically (e.g., oldest creationTimestamp) and pass its `model_ref` to the FileBackend
- **AND** SHALL return the updated projection entry, including the resolved `model_ref` so the caller knows which destination was warmed
- **AND** the operation is best-effort: a Query later targeting a different OpenAI account will project on its own at dispatch time (cache miss)

### Requirement: Upload supports hint-based prewarm

The `prewarm_model_ref` and `prewarm_provider` form fields on `POST /v1/files` MAY be set (mutually exclusive; `prewarm_model_ref` takes precedence if both are provided) to trigger a best-effort projection call to the matching FileBackend after the workspace upload completes. The upload response SHALL NOT block on prewarm completion.

The `prewarm_model_ref` form encodes a Model reference (e.g., `"team-a/gpt-4-prod"`) for destination-accurate prewarm; the dashboard composer (which knows the active chat's Model) SHOULD prefer this form. The `prewarm_provider` form (e.g., `"openai"`) is best-effort and resolves to one Model on that provider deterministically (see prewarm endpoint scenarios); callers that don't know which Model will consume the file MAY use it but should expect occasional cache misses at dispatch when the eventual Model targets a different account.

#### Scenario: Prewarm with destination-accurate model_ref

- **WHEN** a caller uploads with `prewarm_model_ref="team-a/gpt-4-prod"`
- **AND** the named Model exists and its provider has a matching FileBackend
- **THEN** ark-api SHALL return success immediately after the workspace upload
- **AND** SHALL initiate the projection call for that specific Model's destination without blocking the response
- **AND** the projection state SHALL appear as "ready" in a subsequent listing scoped to the same Model once complete

#### Scenario: Prewarm with provider hint is best-effort

- **WHEN** a caller uploads with `prewarm_provider="openai"`
- **AND** an `openai` FileBackend is installed
- **THEN** ark-api SHALL select one Model with `spec.provider: "openai"` from the namespace deterministically (e.g., oldest creationTimestamp) and prewarm for that Model's destination
- **AND** SHALL return success immediately after the workspace upload

#### Scenario: Prewarm for missing backend silently noop

- **WHEN** a caller uploads with `prewarm_provider="anthropic"`
- **AND** no `anthropic` FileBackend is installed
- **THEN** ark-api SHALL accept the upload normally
- **AND** SHALL NOT fail the upload
- **AND** SHALL NOT include an anthropic entry in the response's `projections` block

### Requirement: ark-api enforces auth via impersonated K8s calls (matching existing pattern)

ark-api SHALL gate every `/v1/files` route by performing an impersonated Kubernetes API call on the caller's behalf. Authorization is enforced by the Kubernetes API server when the impersonated client attempts the action; ark-api inspects the resulting error (e.g., 403) and surfaces it to the caller. This matches the pattern used by existing ark-api routes (queries.py, agents.py, etc.) and uses the same `ImpersonationConfig` machinery.

Verb mapping for v1 — file routes gate on access to the Workspace and FileBackend CRs:

- LIST/GET (files) → impersonated `get` on `workspaces.ark.mckinsey.com` in the namespace
- POST (upload) → impersonated `get` on `workspaces.ark.mckinsey.com` in the namespace
- DELETE → impersonated `get` on `workspaces.ark.mckinsey.com` in the namespace
- POST (prewarm) → impersonated `get` on `workspaces.ark.mckinsey.com` AND `get` on `filebackends.ark.mckinsey.com`

A bundled ClusterRole `ark-workspace-user` SHALL grant `get` on `workspaces.ark.mckinsey.com` and `filebackends.ark.mckinsey.com`. The role is intended for namespace-bound RoleBinding by cluster operators.

(v1 deliberately uses a coarse "if you can read the Workspace CR, you can use it" gate. Finer-grained read-only vs read-write distinctions can be added later by extending the impersonated check to different verbs.)

#### Scenario: Caller without permission rejected

- **WHEN** a caller without `get` on `workspaces.ark.mckinsey.com` in the target namespace requests `GET /v1/files`
- **THEN** ark-api's impersonated K8s call SHALL return 403
- **AND** ark-api SHALL return HTTP 403 to the caller

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

When no `Workspace` is configured in the namespace, the attach affordance SHALL be hidden with explanatory help text linking to marketplace install guidance.

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
- **THEN** the dashboard SHALL hide the attach affordance
- **AND** SHALL show explanatory text linking to marketplace install guidance
