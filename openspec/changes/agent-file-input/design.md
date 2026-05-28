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
- Executors don't learn about FileBackends or projection. The completions executor's dispatch-time memory READ moves to the controller (because projection requires walking history); executor memory WRITES for assistant/tool outputs are unchanged. External executors via ark-sdk receive a controller-supplied `request.history` (new optional field) containing the fully projected message stream — they may consume it or continue to use provider-side state (e.g., openai-responses' `previous_response_id`).

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

### Decision: Memory carries `ark.file` content parts inside the existing OpenAI message shape

The broker's storage contract is unchanged: `Message = unknown`, no schema enforcement, persistence remains opt-in and unchanged. Workspace references travel as a custom content part inside an otherwise-normal OpenAI user message:

```
{ "role": "user", "content": [
    { "type": "text", "text": "summarise this" },
    { "type": "ark.file", "uri": "ark://workspace/report.pdf" }
] }
```

OpenAI's `content` field is already polymorphic (array of typed parts: text, image_url, input_file, ...). Adding an `ark.file` part type doesn't change the broker's contract. Storage works unchanged; existing persisted JSON-file-store data continues to round-trip; pre-upgrade conversations remain readable.

At dispatch time, the controller walks all messages (new input + memory history) and translates every `ark.file` part into a provider-native part (input_file, image_url, etc.) by calling the matching FileBackend. The translated form is what the executor receives over A2A. `ark.file` parts NEVER reach an LLM provider — that's the whole point of the translation step.

**Alternative considered:** A2A-parts-rich canonical memory shape (with versioned format + load-time upcast for opt-in persistence users). Rejected for v1 because (a) the broker's `Message = unknown` already lets us preserve workspace URIs without a schema change, (b) the migration cost — even if small — is unnecessary, and (c) the v1 goal (sessions inherit attachments via replay) is fully served by the `ark.file` content part. Future v2 may revisit this when a second non-OpenAI executor needs to read memory directly without going through the OpenAI-shaped representation; at that point the broker's coupling note in `services/ark-broker/CLAUDE.md` becomes worth resolving structurally. v1 leaves that coupling as documented today.

**Alternative considered:** memory stores provider-native parts (e.g., OpenAI `file_id`). Rejected — it locks the conversation to the provider used on the first turn and forecloses the "switch providers mid-session" property.

### Decision: Two pluggable layers, both namespace-scoped CRDs

`Workspace` (CRD): owns the bytes and the upload/list/download/delete contract. At most one per namespace, enforced by validating webhook.

`FileBackend` (CRD): owns provider-side projection — fetches workspace URIs and exposes provider-native file references. At most one per `(namespace, provider)` pair by default, with an escape hatch (see Model matching below).

Neither knows about the other directly. The controller and ark-api are the only points of integration.

**Alternative considered:** a single combined "FileSystem" abstraction. Rejected — bytes storage and provider projection have different lifecycles, scaling profiles, and ops stories; conflating them produces the abandoned-branch shape.

### Decision: Match FileBackend to Model implicitly by provider, with optional override

At dispatch time, the controller finds the FileBackend whose `spec.provider` matches the target Model's `spec.provider`. Model.spec.fileBackend (new optional field) takes precedence when set, supporting niche scenarios like experimental backends or multi-org separation.

The "wrinkle" of provider accounts (one OpenAI org per API key) is handled INSIDE the FileBackend cache by keying on a destination identity (see Decision: FileBackend cache keyed by destination, below), not at the matching layer. A single FileBackend install serves every Model targeting that provider.

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

### Decision: No built-in default workspace (E5-auto-4)

ark-api does NOT ship a built-in default workspace. If no `Workspace` CR exists in a namespace, the `/v1/files` endpoints return 404 with guidance pointing at the marketplace install. The dashboard hides the attach affordance and surfaces the same install guidance.

This is the cleaner architectural separation — ark-api stays stateless, no durability/persistence questions inside core, no multi-replica failure modes. The first-five-minutes UX cost is real (users must install file-gateway before files work) but is documented and surfaced through `FileBackend.status.conditions[Ready]=False/NoWorkspace` whenever a file backend is installed without a workspace.

**Alternative considered (E5-auto-5, initially proposed):** ark-api ships a built-in ephemeral workspace so files work zero-config. Rejected after pre-implementation review for two related reasons: (1) ark-api becomes stateful in a way no other code path requires it to be, and (2) under multi-replica deployment the in-process or emptyDir backing fails (uploads land on pod A, reads from pod B return empty), while a PVC-backed alternative needs ReadWriteMany — a stronger cluster dependency than the marketplace install it was trying to avoid. The "make zero-install pleasant" instinct survives in clearer error messages and well-targeted documentation, not in a shadow storage layer.

### Decision: Controller is the single translator; covers both new input AND replayed history

Executors receive provider-native parts; they never see workspace URIs or `ark.file` content parts from any source — new input or memory replay. The controller's dispatch path performs ONE translation pass over the full message stream:

1. Controller writes the new user message (with `ark.file` parts) to memory.
2. Controller reads the full conversation history from memory.
3. Controller resolves the target Model and the FileBackend to use.
4. Controller walks every message in the stream, finds every `ark.file` content part, and calls the FileBackend for each. The FileBackend returns a rendered message-part envelope (input_file for documents, image_url/input_image for images, etc.).
5. Controller substitutes each `ark.file` with the returned envelope.
6. Controller hands the fully-projected message stream to the executor via A2A.

The FileBackend handles MIME-aware mapping internally because the right shape depends on both file type and provider API surface:
- Documents (PDF, DOCX, CSV, ...) → `input_file` with `file_id`
- Images (PNG, JPG, GIF, WebP) → `image_url` (Chat Completions) or `input_image` (Responses); inline data URL or `file_id` reference
- Future types (audio, video) plug in with no controller change

**Alternative considered:** executor (or SDK delivery layer) translates at read time. Rejected — splits translation across two code paths (controller for new input, executor for history) and forces the executor to learn about FileBackends, contradicting the "executor doesn't know about backends" guarantee.

**Alternative considered:** broker as translator. Rejected — couples the broker to FileBackends and pushes provider knowledge into the persistence layer; broker shouldn't know about LLM providers.

**Alternative considered:** controller does MIME-based part-type selection itself. Rejected — forces the controller to learn provider-specific part schemas and to track them as providers evolve. The FileBackend already knows its provider's API; the natural place for the mapping is there.

### Decision: Controller reads memory for dispatch — limited reversal of the March 2026 executor extraction

The c5dc1455 refactor ("extract completions executor and promote to standalone service", PR #1357, March 2026) moved all execution logic — including the completions executor's memory access — out of the controller into the standalone executor binary. The principle was "memory belongs with execution, not orchestration."

The projection step in this change requires the controller to walk the full conversation history at dispatch time (to translate `ark.file` parts before handing the stream to the executor). That re-introduces controller-side memory access, but only for the dispatch path and only for reads.

The reversal is deliberately scoped:
- **Controller WRITES**: only the new user message (in `ark.file` form, pre-projection), once per Query.
- **Controller READS**: the full conversation history at dispatch, to project all `ark.file` parts in a single pass.
- **Executor WRITES**: all assistant and tool responses, unchanged from today.
- **Executor READS**: none for the dispatch path — history arrives over A2A from the controller. The completions executor's `memory_http.go` can drop its read-for-dispatch code; memory writes for outputs remain. The Go HTTP client to the broker can be extracted into a shared package (e.g., `ark/internal/memory/client/`) used by both controller and completions executor.

Net effect: the controller orchestrates dispatch context (including history projection); the executor still owns execution-time memory writes. This preserves the spirit of c5dc1455 — execution logic stays in the executor — while acknowledging that projection is orchestration, not execution. The broker remains the unified storage layer for memory; what shifts is which callsites talk to it for dispatch reads, not where the data lives.

**Alternative considered:** keep memory reads entirely in the executor; have the executor translate `ark.file` (via SDK glue). Rejected — see "single translator" decision above. Splits the path and contradicts the "executor doesn't know about backends" guarantee.

**Alternative considered:** pass projection RPC capability into the executor / SDK so it can translate on read. Rejected for the same reason — the surface area we'd avoid in the executor proper just moves into the SDK, with the same coupling cost.

### Decision: Executors have varying memory strategies today; controller-as-translator unifies them

Inspecting the marketplace reveals that "executor reads memory" is not the universal pattern that the c5dc1455 framing implies. Each existing executor handles conversation history differently:

- **completions executor (Go)** — reads broker memory via `memory_http.go`, resends full history to OpenAI Chat Completions on every turn. Multi-turn continuity is client-side.
- **openai-responses executor (Python, marketplace)** — does NOT read broker memory at all. Uses OpenAI's Responses API `previous_response_id` (stored on a PVC by the executor) to maintain server-side state. The `request.history` field in its code is dead today because ark-sdk's `ExecutionEngineRequest` doesn't populate one.
- **claude-agent-sdk executor (Python, marketplace)** — uses Claude's session/context-id mechanism via the Claude Agent SDK; details vary.
- **langchain executor (Python, marketplace)** — its own pattern.

There is no uniform contract today for "how does an executor know about prior turns?" Each implements its own mechanism, sometimes broker-backed, sometimes provider-backed, sometimes a mix.

This change makes the controller the **primary** source of conversation history at dispatch (because projection requires walking history). To make that history visible to executor code:

1. `ark-sdk` adds an optional `history: list[Message]` field on `ExecutionEngineRequest`.
2. `resolve_query()` in `ark-sdk` populates the field from the broker when `conversationId` is set.
3. Executor implementations may use `request.history` directly, or continue to use their own provider-backed state and ignore the supplied history (no contradiction — A2A history is what's available; the executor's strategy is its own).

This unifies the controller-side story without forcing executors to abandon working patterns. An executor that uses `previous_response_id` keeps doing so; an executor that prefers replaying broker history now has a field to read.

**Alternative considered:** make `request.history` mandatory and require every executor to honor it. Rejected — the openai-responses pattern (`previous_response_id`) is genuinely more efficient where it applies, and forcing executors away from it loses value. Optional field with documented semantics is enough.

**Alternative considered:** keep `request.history` absent and have executors fetch from the broker themselves. Rejected — duplicates the controller's projection work, forces every executor to know how to project `ark.file` (which means knowing about FileBackends), and re-creates the inconsistency.

### Decision: FileBackend resolves its own credentials from a Model reference

The controller passes a Model REFERENCE (namespace + name) in projection requests, not credential values. The FileBackend service uses its own K8s API access (its own ServiceAccount + RBAC) to read the Model CR and resolve the Model's apiKey ValueSource — the same pattern the completions executor uses today (`ark/executors/completions/model_openai.go` calls `resolver.ResolveValueSource(ctx, config.APIKey, namespace)`).

This means:
- The apiKey value NEVER appears in an HTTP body crossing a service boundary.
- The apiKey value NEVER appears in logs of intermediary services.
- Credentials are read directly from Secrets by the service that uses them, gated by that service's RBAC — identical to how the executor reads Model credentials today.
- The FileBackend marketplace chart ships a ServiceAccount + Role granting `get` on `models.ark.mckinsey.com` and on the Secrets the Models reference, in its namespace.

**Alternative considered:** controller resolves credentials and passes them in the `/v1/projections` request body. Rejected because it introduces a new credential exposure surface that no other Ark service uses today. Every credential-using service in Ark (completions, file-gateway clients, memory-http) reads its own credentials directly from K8s; the FileBackend should follow the same pattern.

### Decision: FileBackend cache keyed by `(workspace_uri, etag, destination_id)`

The destination is the provider-specific account/org identity the credentials authenticate TO, not a hash of the credentials themselves. For OpenAI: the organization id, resolved via `GET /v1/organization`. For Anthropic: workspace id. For Bedrock: AWS account id + region. For Azure OpenAI: tenant + resource name.

The FileBackend resolves `destination_id` from credentials internally, caches the resolution locally (with TTL) to avoid repeated API calls, and uses `destination_id` as part of the cache key.

This means:
- Two Models with different API keys pointing at the SAME OpenAI org share cache entries (they authenticate to the same destination).
- A single Model whose API key is rotated (same org, new key value) keeps its cache entries.
- A Model migrated to a different org (different destination_id) gets fresh projections automatically.

**Alternative considered:** hash the resolved credential value (apiKey). Rejected — invalidates the cache on routine secret rotation even when the destination is unchanged; legitimate rotation triggers re-uploads of every file.

**Alternative considered:** hash the credential REFERENCE (secret namespace/name/key). Rejected — gets both directions wrong: two secrets pointing at the same org would each have their own cache entry, and a secret rotated to a different org would share its cache entry with the old org.

**Alternative considered:** no account scoping in the cache; key only by `(uri, etag)`. Rejected — file_id from one org would be returned for a request authenticating to another org, producing either a 404 at the provider or, worse, a silent cross-account collision.

### Decision: Failure to project rejects the Query loudly

If the Model's provider has no FileBackend (and no override is set), or if the FileBackend's projection call fails, the Query is rejected with a status condition naming both the path tried (override vs implicit match) and the underlying error.

No fallback to inline base64. Inline (#1835) is a separate code path; conflating them obscures the failure mode.

### Decision: RBAC matches existing ark-api pattern — impersonated K8s call, no SubjectAccessReview

ark-api gates `/v1/files` routes using the same pattern existing routes use today (queries.py, agents.py, etc.): the caller's identity is impersonated through `ImpersonationConfig` (`services/ark-api/ark-api/src/ark_api/auth/dependencies.py`), and authorization is enforced by the Kubernetes API server itself when the impersonated client performs an action on a real CR. ark-api inspects the resulting error (e.g., 403 from `impersonation_errors.py`) and surfaces it as an HTTP error to the caller.

For file routes specifically:
- LIST/GET → caller's impersonated client attempts `get` on `workspaces.ark.mckinsey.com` in the namespace. If denied, return 403.
- UPLOAD/DELETE → caller's impersonated client attempts the same; ark-api uses access to the Workspace CR as the gate. (We deliberately don't introduce a read-only/read-write distinction at the API layer for v1; if needed, it can be added by extending the impersonated check to a different verb.)
- PREWARM → same gate, plus impersonated `get` on the FileBackend CR.

A shipping ClusterRole template (`ark-workspace-user`) grants `get` on `workspaces` and `filebackends` for namespace-bound use. Users who need finer-grained control compose their own role bindings.

**Alternative considered (initially proposed):** a custom `workspaces/files` subresource gated via SubjectAccessReview. Rejected after pre-implementation review because ark-api has zero SubjectAccessReview callers today; all existing auth uses impersonated calls and 403 inspection. Introducing the first SAR-based path AND a phantom subresource (the API server can't actually serve `workspaces/files` because no controller registers it) is a new pattern the codebase doesn't otherwise use. Matching the existing pattern is simpler and consistent.

**Alternative considered:** map file ops to standard verbs on the Workspace CR itself (UPDATE for uploads). Rejected — semantically misleading; uploading doesn't change the CR. We use the simpler "can you read the Workspace?" gate instead, accepting the coarseness for v1.

### Decision: FileBackend status reports workspace dependency

The FileBackend reconciler watches the namespace's Workspace state and sets a Ready condition. If the Workspace is absent, FileBackend.status reports `Ready=False/NoWorkspace` with a message pointing at marketplace install guidance. The dashboard surfaces this in the FileBackend list and on the Files page's empty state.

This addresses the "I installed openai-files but nothing works" failure mode without forcing FileBackend charts to bundle their own workspace.

## Risks / Trade-offs

- **Provider-side TTL drift** → A file_id cached in a FileBackend can be deleted at the provider out-of-band (OpenAI is "persists until manually deleted", but admins can delete from the OpenAI dashboard). Mitigation: FileBackend re-projects on cache miss; cache entries that fail at use are invalidated.

- **Vision-capable Model required for image attachments** → Projection succeeds whenever the workspace can serve the file and the FileBackend accepts the MIME, but a non-vision OpenAI model receiving an image part errors at LLM call time. Mitigation in v1: surface the underlying provider error in the Query status; documented as a known UX gotcha. Future: Model capability advertisement so attach-time UX warns users; out of scope for v1.

- **Memory replay re-projection cost** → Each replay turn requires the controller to ask the FileBackend "do you have this projected?" — a metadata round-trip per FilePart. Mitigation: FileBackend cache lookups are cheap; this cost is far smaller than the actual LLM call latency. The replay path is already O(messages) in the executor; this adds O(file_refs) within that.

- **Mid-conversation overwrite changes content** → Overwriting `report.pdf` mid-conversation means the next replay turn sees the new bytes. Could surprise users. Mitigation: document the behavior; the alternative (snapshot consistency) requires a versioning story we explicitly aren't building.

- **First-five-minutes UX requires marketplace install** → Without a built-in default workspace, installing Ark alone doesn't enable the file feature. Users must also install file-gateway from marketplace. Mitigation: `FileBackend.status.conditions[Ready]=False/NoWorkspace` makes the missing dependency observable via kubectl describe; dashboard surfaces install guidance; docs lead with the install order; marketplace ark-openai-files chart's NOTES.txt hints at the dependency.

- **Provider-side orphans on overwrite** → If FileBackend reap-on-eviction misses (network blip), provider-side files accumulate. Mitigation: FileBackend exposes a `DELETE /v1/projections/<id>` endpoint and a periodic reconcile that compares its cache to workspace state.

- **Controller becomes the dispatch-time memory reader** → A new code path; partial reversal of c5dc1455's split. Mitigation: scoped narrowly to read-for-dispatch (executor still owns writes for outputs); reuses the existing memory broker API (no new contract). Regression risk concentrated in one new step; covered by chainsaw tests for multi-turn sessions.

- **Larger A2A messages on dispatch** → Full conversation history travels over the wire with each dispatch (controller → executor). Mitigation: same byte count the executor would have fetched directly; just from a different direction. Existing A2A history field already supports this.

- **Validating webhook lag for multi-FileBackend conflict** → Two FileBackends with the same provider in the same namespace are admission-rejected, but a race could allow both to exist briefly. Mitigation: webhook serializes; controller also defensively picks one and emits an event if it sees a duplicate.

- **Workspace bytes layer remains unauthed** → file-gateway's file-api has no auth; ark-api is the only gate. Mitigation: NetworkPolicies (existing) restrict access to in-cluster callers; v2 can layer per-request auth if needed.

## Migration Plan

This change is additive at every layer. No existing user breaks.

1. **Core PR (ark/):** introduce Workspace + FileBackend CRDs, `Model.spec.fileBackend` optional field, controller projection step (with memory read for dispatch history), ark-api /v1/files routes, dashboard attach affordance, executor changes (memory writes only; remove dispatch-time memory reads), RBAC ClusterRole template, docs.
2. **Marketplace PR (file-gateway):** add a Workspace CR template referencing the existing file-api service. Helm upgrade is the only user action required.
3. **Marketplace PR (new ark-openai-files chart):** ships the OpenAI Files API projection service, FileBackend CR template with `spec.provider=openai`, capabilities advertisement, ServiceAccount + Role for K8s API access (read Models + relevant Secrets in namespace).
4. **Marketplace charts declare** minimum ark-core version (semver).

**Rollback:**
- Core PR rollback: Workspace/FileBackend CRs may exist but the controller no longer projects; Queries with FileParts fail at dispatch. Dashboard hides file UI. No data loss.
- Marketplace PR rollback: removing the Workspace CR template makes file-gateway visible only via the generic proxy (today's behavior); files remain in S3 untouched.

## Open Questions

- **Bulk delete (`DELETE /v1/directories?prefix=...`).** file-gateway has it; not needed for v1 chat-attachment flow; could add in v1 cheaply if dashboard wants folder-level operations.

- **Resumable upload (tus or similar).** Not v1. May be added as a per-Workspace capability flag.

- **Workspace and FileBackend HTTP contracts in detail.** This document settles the architecture; the exact request/response schemas (multipart fields, response envelopes, error codes) belong in the capability specs and will be enumerated there.

- **Future v2: A2A-rich canonical memory shape.** v1 keeps the broker's `Message = unknown` contract and lets `ark.file` content parts ride inside the OpenAI message shape. When a second non-OpenAI executor needs to read memory directly without going through OpenAI-shaped messages, the broker's coupling to OpenAI format (noted in `services/ark-broker/CLAUDE.md`) becomes worth resolving structurally. At that point the memory shape may evolve, with a versioned format and a load-time upcast. Deferred until that driver exists.

- **`Model.spec.fileBackend` cross-namespace references.** v1 the named FileBackend is resolved in the same namespace as the Model. If cross-namespace references ever become useful, the field's shape (`{ name, namespace? }`) is forward-compatible — defer the decision.
