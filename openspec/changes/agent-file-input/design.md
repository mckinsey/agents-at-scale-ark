## Context

Issue #2051 captures the gap: there is no Ark-native path for a user to upload a file and have an Ark agent reason over it. Inline base64 from #1835 does not scale; the OpenAI Files API path (`file_id` referenced as `input_file` part) has no Ark primitive.

Current state:
- `file-gateway` (marketplace) provides S3-backed bytes storage via a FastAPI service (file-api) and an MCP interface (filesystem-mcp). The dashboard reaches it via ark-api's generic service proxy.
- The completions executor already handles A2A FilePart with URI (`ark/internal/a2a/a2a_protocol.go`) — transport is not the blocker.
- Query.spec.input is a `RawExtension`; non-string input shapes are already supported without a CRD change.
- A previous attempt on `feat/file-assistant-ui` shipped parallel `/files/workspace/*` and `/files/model-context/openai/*` routes. The user did the orchestration. Abandoned because the architecture forked.

The proposal (proposal.md) settles WHAT changes; this document settles HOW.

## Goals / Non-Goals

**Goals:**
- Users can attach files to an Ark Query and have the configured Model reason over them.
- Workspaces and provider-side file backends are independently pluggable; both come from the marketplace; neither is required for core Ark.
- A file uploaded once can be referenced across many Queries to the same provider without re-upload.
- Sessions inherit attachment context automatically through memory replay; switching providers mid-conversation re-projects transparently.
- OpenAI is the first integration; Anthropic, Bedrock, and Azure can be added later with zero core changes.
- Executors not modified to support file inputs (default behavior); a small SDK hook exists for executors that want their own backend handling.

**Non-Goals:**
- Agent-scoped or Team-scoped attachments (every Query carries its own attachments in v1; session continuity comes from memory replay).
- Cross-provider file portability beyond what memory replay provides (no canonical bytes deduplication, no provider-agnostic file IDs).
- Content-addressable storage; files are name-keyed within a workspace.
- Resumable / chunked uploads for files larger than the per-Workspace cap.
- Cross-namespace workspace references.
- A unified RBAC model for the bytes layer; workspace services remain unauthed in v1 behind cluster networking.

## Decisions

### Decision: Files identified as A2A FilePart with URI

The Query input shape carries A2A-shaped message parts. Files are `FilePart` entries with a URI of the form `ark://workspace/<path>`. No CRD migration; `Query.spec.input` is already a `RawExtension`.

**Alternative considered:** structured tuple in a new field (e.g. `Query.spec.attachments[]`). Rejected — it would create a parallel path to A2A FilePart, which executors and memory already understand. The URI form composes with multimodal content (#1835) on the same code path.

### Decision: Memory preserves FileParts faithfully

The canonical memory message shape becomes provider-agnostic A2A-shaped parts. OpenAI-flat is a derived view at executor time. On each replay turn, the controller re-projects URIs to provider-native parts; FileBackend cache makes this a metadata lookup, not a re-upload.

**Alternative considered:** memory stores provider-native parts (e.g., OpenAI `file_id`). Rejected — it locks the conversation to the provider used on the first turn and forecloses the "switch providers mid-session" property.

### Decision: Two pluggable layers, both namespace-scoped CRDs

`Workspace` (CRD): owns the bytes and the upload/list/download/delete contract. At most one per namespace, enforced by validating webhook.

`FileBackend` (CRD): owns provider-side projection — fetches workspace URIs and exposes provider-native file references. At most one per `(namespace, provider)` pair by default, with an escape hatch (see Model matching below).

Neither knows about the other directly. The controller and ark-api are the only points of integration.

**Alternative considered:** a single combined "FileSystem" abstraction. Rejected — bytes storage and provider projection have different lifecycles, scaling profiles, and ops stories; conflating them produces the abandoned-branch shape.

### Decision: Match FileBackend to Model implicitly by provider, with optional override

At dispatch time, the controller finds the FileBackend whose `spec.provider` matches the target Model's `spec.provider`. Model.spec.fileBackend (new optional field) takes precedence when set, supporting niche scenarios like experimental backends or multi-org separation.

The "wrinkle" of provider accounts (one OpenAI org per API key) is handled INSIDE the FileBackend cache, not at the matching layer. Cache key includes an account fingerprint derived from the Model's credentials, which are passed in-band with each projection call. A single FileBackend install serves every Model targeting that provider.

**Alternatives considered:**
- Required `Model.spec.fileBackend`. Rejected — defeats the "just install it" marketplace UX.
- Label-based default-per-provider on FileBackend. Rejected — the implicit-by-provider path already does this with less ceremony.
- A `ProviderAccount` CRD that both Model and FileBackend reference. Rejected as premature; the matching question doesn't require this and v2 can introduce it additively.

### Decision: Workspace and URI scheme — namespace-scoped, at most one, no name in URI

URI form: `ark://workspace/<path>`. Resolved against the caller's (or Query's) namespace. v1 forbids more than one Workspace CR per namespace via validating webhook.

No forward-compat reservations in v1. If multiple workspaces ever become necessary, a different URI grammar will be designed at that time. The `ark://workspace:name` form initially suggested was discarded because it conflicts with RFC 3986 (`:` in authority position parses as port, which must be digits).

**Alternative considered:** required first-segment name with `default` as the literal v1 value (`ark://workspace/default/<path>`). Rejected for v1 because it adds a per-URI cost for a feature we may never need. Forward-compat is not free, and overpaying for it isn't warranted here.

### Decision: Hint-based eager prewarm; lazy-at-dispatch is canonical

Upload accepts a `prewarm` form field naming a provider. ark-api stores in the workspace and returns immediately, then fires a best-effort projection call to the matching FileBackend. The projection itself is canonical at Query dispatch — if the cache is cold, the controller projects synchronously before sending the message to the executor.

This makes "eager" a pure optimization, removing any need for a separate projection state machine. The FileBackend cache IS the state.

**Alternative considered:** synchronous projection at upload time (block the response until the provider finishes ingest). Rejected — couples upload latency to provider parsing, which can be many seconds for PDFs. Best UX under failure (you find out at upload time) but worst UX under success (you wait every time).

**Alternative considered:** persistent async state machine with status field per (file, provider). Rejected — invents state we don't otherwise need; introduces race resolution between "still pending" and "Query dispatched".

### Decision: ark-api streams uploads through to the workspace

`POST /v1/files` accepts multipart, streams the body to the workspace service. This formalizes today's behavior, where the dashboard reaches file-gateway through ark-api's generic proxy. The new typed endpoint replaces the generic-proxy path for files and adds projection orchestration.

**Alternative considered:** presigned URL handoff (workspace generates a URL; browser uploads directly). Rejected for v1 — file-gateway today does not implement presigning, and CORS / auth becomes scattered across services. Can be added later as a per-Workspace capability.

### Decision: Allow-list lives on FileBackend, not Workspace

The Workspace owns storage; it accepts essentially anything (optional security deny-list for things like executables). Each FileBackend advertises its accepted MIME types and size limits via `spec.constraints`. ark-api uses these to populate per-provider compatibility in list responses; failure to project an unsupported file at dispatch rejects the Query with a clear status condition.

This is the right layering because what's "valid" depends on the provider's API, not on storage. OpenAI's Files API endpoint is permissive at upload but strict at consumption — and the strict surface differs across Chat, Responses, and Assistants APIs ([OpenAI File Inputs Guide](https://developers.openai.com/api/docs/guides/file-inputs)). Putting the allow-list on the Workspace would have it lie about correctness.

### Decision: Overwrite semantics are S3-style

A second upload to the same `(prefix, filename)` replaces the bytes; the etag changes. The FileBackend cache key includes the etag, so the old projection naturally falls out of cache; the backend reaps the old provider-side file on cache eviction. No grace period in v1 — memory stores URI only, so mid-conversation overwrites change what the next replay turn projects.

**Alternatives considered:** 409 on conflict, auto-suffix. Both rejected — change the contract relative to file-gateway today, and don't match common filesystem semantics.

### Decision: Built-in default workspace inside ark-api (E5-auto-5)

For the zero-marketplace experience: ark-api ships a built-in default workspace. When a namespace has no `Workspace` CR, ark-api uses its built-in. When a Workspace CR is created (e.g., by installing file-gateway), ark-api routes to that service instead, transparently.

The built-in is documented as a quickstart facility, not a production store: small total cap, no durability promises, lists itself in the UI with a "install file-gateway for persistent storage" banner. Persistence detail (PVC vs emptyDir vs pure in-memory) is deferred to implementation — see Open Questions.

**Alternative considered (raised for discussion):** E5-auto-4 — no built-in workspace; rely on documentation and FileBackend.status conditions to direct users to install file-gateway. Cleaner separation, but the out-of-box experience is "install Ark, install ark-openai-files, attach a file... nothing happens." Worth weighing during review; if the team prefers the strict separation, we drop E5-auto-5 and rely on docs.

### Decision: Controller does projection translation at dispatch; FileBackend returns the rendered part envelope

Executors receive provider-native parts; they do not see workspace URIs. The controller's dispatch path resolves Workspace, fetches the file (or its URI + etag), and calls the matching FileBackend, which returns a **rendered message-part envelope** alongside the cache-keying `provider_file_id`. The controller substitutes the FilePart in the message with the returned envelope.

The FileBackend handles MIME-aware mapping internally because the right shape depends on both file type and provider API surface:
- Documents (PDF, DOCX, CSV, ...) → `input_file` with `file_id`
- Images (PNG, JPG, GIF, WebP) → `image_url` (Chat Completions) or `input_image` (Responses); inline data URL or `file_id` reference
- Future types (audio, video) plug in with no controller change

**Alternative considered:** each executor handles its own backend (the abandoned branch's approach). Rejected — couples every executor to every backend; custom executor authors have to re-implement the projection plumbing.

**Alternative considered:** controller does MIME-based part-type selection itself. Rejected — forces the controller to learn provider-specific part schemas and to track them as providers evolve. The FileBackend already knows its provider's API; the natural place for the mapping is there.

### Decision: Failure to project rejects the Query loudly

If the Model's provider has no FileBackend (and no override is set), or if the FileBackend's projection call fails, the Query is rejected with a status condition naming both the path tried (override vs implicit match) and the underlying error.

No fallback to inline base64. Inline (#1835) is a separate code path; conflating them obscures the failure mode.

### Decision: RBAC via a custom subresource on Workspace

ark-api enforces access via SubjectAccessReview against `workspaces/files` subresource verbs:
- LIST/GET → GET on `workspaces/files`
- UPLOAD → CREATE on `workspaces/files`
- DELETE → DELETE on `workspaces/files`
- PREWARM → CREATE on `workspaces/files` + GET on `filebackends`

A shipping ClusterRole template (`ark-workspace-user`) bundles all verbs for namespace-bound use. ImpersonationConfig handles identity at the API surface, matching existing ark-api routes.

**Alternative considered:** treat all file ops as "GET on Workspace CR" (coarse). Rejected — no separation between read-only and read-write.

**Alternative considered:** map file ops to standard verbs on the Workspace CR itself (UPDATE for uploads). Rejected — semantically misleading; uploading doesn't change the CR.

### Decision: FileBackend status reports workspace dependency

The FileBackend reconciler watches the namespace's Workspace state and sets a Ready condition. If the Workspace is absent, FileBackend.status reports `Ready=False/NoWorkspace` with a message pointing at marketplace install guidance. The dashboard surfaces this in the FileBackend list and on the Files page's empty state.

This addresses the "I installed openai-files but nothing works" failure mode without forcing FileBackend charts to bundle their own workspace.

## Risks / Trade-offs

- **Provider-side TTL drift** → A file_id cached in a FileBackend can be deleted at the provider out-of-band (OpenAI is "persists until manually deleted", but admins can delete from the OpenAI dashboard). Mitigation: FileBackend re-projects on cache miss; cache entries that fail at use are invalidated.

- **Vision-capable Model required for image attachments** → Projection succeeds whenever the workspace can serve the file and the FileBackend accepts the MIME, but a non-vision OpenAI model receiving an image part errors at LLM call time. Mitigation in v1: surface the underlying provider error in the Query status; documented as a known UX gotcha. Future: Model capability advertisement so attach-time UX warns users; out of scope for v1.

- **Memory replay re-projection cost** → Each replay turn requires the controller to ask the FileBackend "do you have this projected?" — a metadata round-trip per FilePart. Mitigation: FileBackend cache lookups are cheap; this cost is far smaller than the actual LLM call latency. The replay path is already O(messages) in the executor; this adds O(file_refs) within that.

- **Mid-conversation overwrite changes content** → Overwriting `report.pdf` mid-conversation means the next replay turn sees the new bytes. Could surprise users. Mitigation: document the behavior; the alternative (snapshot consistency) requires a versioning story we explicitly aren't building.

- **Built-in default workspace UX cliff** → Users adopt the default, accumulate files, then notice the "ephemeral / not for production" framing too late. Mitigation: dashboard banner is persistent; size cap is small enough that hitting it forces an upgrade decision early; docs and the marketplace install instructions reinforce.

- **ark-api becomes stateful (E5-auto-5)** → If we ship the built-in workspace, ark-api owns durable-ish state, which it didn't before. Mitigation: small cap; storage path encapsulated; can be excised cleanly if E5-auto-4 wins on review.

- **Provider-side orphans on overwrite** → If FileBackend reap-on-eviction misses (network blip), provider-side files accumulate. Mitigation: FileBackend exposes a `DELETE /v1/projections/<id>` endpoint and a periodic reconcile that compares its cache to workspace state.

- **Validating webhook lag for multi-FileBackend conflict** → Two FileBackends with the same provider in the same namespace are admission-rejected, but a race could allow both to exist briefly. Mitigation: webhook serializes; controller also defensively picks one and emits an event if it sees a duplicate.

- **Workspace bytes layer remains unauthed** → file-gateway's file-api has no auth; ark-api is the only gate. Mitigation: NetworkPolicies (existing) restrict access to in-cluster callers; v2 can layer per-request auth if needed.

## Migration Plan

This change is additive at every layer. No existing user breaks.

1. **Core PR (ark/):** introduce Workspace + FileBackend CRDs, controller projection step, ark-api /v1/files routes, dashboard attach affordance, memory FilePart preservation, built-in default workspace, RBAC ClusterRole template, docs.
2. **Marketplace PR (file-gateway):** add a Workspace CR template referencing the existing file-api service. Helm upgrade is the only user action required.
3. **Marketplace PR (new ark-openai-files chart):** ships the OpenAI Files API projection service, FileBackend CR template with `spec.provider=openai`, capabilities advertisement.
4. **Marketplace charts declare** minimum ark-core version (semver).

**Rollback:**
- Core PR rollback: Workspace/FileBackend CRs may exist but the controller no longer projects; Queries with FileParts fail at dispatch. Dashboard hides file UI. No data loss.
- Marketplace PR rollback: removing the Workspace CR template makes file-gateway visible only via the generic proxy (today's behavior); files remain in S3 untouched.

## Open Questions

- **Persistence backing for the built-in default workspace.** PVC-mounted ReadWriteMany would survive restarts and span ark-api replicas, at the cost of a chart dependency on a RWX storage class. emptyDir loses files on pod replacement. Pure in-memory loses on restart and is per-replica. Recommend: small PVC with documented behavior, but flag for implementation review.

- **Whether to ship the built-in default workspace at all (E5-auto-4 vs E5-auto-5).** Settled provisionally on E5-auto-5; raising explicitly for design review because the alternative is materially cleaner architecturally. If the team prefers strict separation of concerns, drop the built-in and rely on docs.

- **Bulk delete (`DELETE /v1/directories?prefix=...`).** file-gateway has it; not needed for v1 chat-attachment flow; could add in v1 cheaply if dashboard wants folder-level operations.

- **Resumable upload (tus or similar).** Not v1. May be added as a per-Workspace capability flag.

- **Workspace and FileBackend HTTP contracts in detail.** This document settles the architecture; the exact request/response schemas (multipart fields, response envelopes, error codes) belong in the capability specs and will be enumerated there.

- **Built-in workspace cleanup policy.** When ark-api's built-in workspace is bypassed by a newly-installed Workspace CR, what happens to the files in the built-in? Recommend: leave them in place (do not auto-migrate); document that switching from default to file-gateway requires manual re-upload. Migrating bytes between workspaces is out of scope.
