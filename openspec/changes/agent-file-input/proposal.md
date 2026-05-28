## Why

Users cannot upload files to Ark and have an agent reason over them. Inline base64 (#1835) does not scale past small payloads, and the OpenAI Files API path that downstream LLM providers expect (file_id referenced as `input_file`) has no Ark-side primitive. Issue #2051 captures the gap: there is no way to attach a PDF, image, or document to a Query and have it reach the configured Model.

The change introduces an end-to-end file-input path that is composable with Ark's "everything is pluggable" stance: a workspace abstraction (where bytes live), a provider-specific file backend (where projections are cached), and a per-message attachment representation that flows through the existing A2A and memory layers without inventing parallel mechanisms.

## What Changes

- A new pluggable **Workspace** resource type representing the canonical store of user-uploaded bytes. Implementations are installed via marketplace (e.g. file-gateway as S3-backed). 0 or 1 may be configured per namespace; the file-input feature is dark when none is installed.
- A new pluggable **FileBackend** resource type representing a provider-side projection target (e.g. OpenAI Files API). 0+ may be installed; each is matched to Models that share its provider. Each backend owns its own `(workspace_uri, etag, destination_id) → provider_file_id` cache, where `destination_id` is the provider-specific identity (e.g., OpenAI organization id) resolved by the backend from the credentials it uses.
- **Model.spec.fileBackend** — new optional field referencing a FileBackend by name; takes precedence over implicit provider-based matching.
- **Query.spec.input** accepts A2A-shaped message parts (text + FilePart-with-URI), reusing the existing protocol primitive. URIs identify files in the configured Workspace (scheme `ark://workspace/<path>`).
- **Memory FilePart preservation** — workspace references travel through memory as a custom `ark.file` content part inside the existing OpenAI message shape. The broker's storage contract is unchanged (`Message = unknown`). No persistence migration. Future v2 may adopt an A2A-parts-rich canonical memory shape when additional non-OpenAI executors need to read memory directly — see design.md for the trade-off.
- **Controller is the single translator** — at dispatch, the controller resolves the target Model, picks the matching FileBackend, then walks every `ark.file` content part across both Query.spec.input AND the replayed memory history, calling the FileBackend for each. The fully-projected message stream is handed to the executor via A2A. Executors never see `ark.file`. This pulls memory READS for dispatch into the controller (the executor still writes assistant/tool outputs to memory unchanged — see design.md for the scope of the change relative to c5dc1455).
- **ark-sdk gains an optional `history` field on `ExecutionEngineRequest`** populated by `resolve_query()` from the broker when `conversationId` is set. Today the field doesn't exist; external executors that need history either do their own broker reads (none currently observed) or rely on provider-side state (e.g., `openai-responses` uses OpenAI's `previous_response_id`). Under this change, the controller-supplied history is available via A2A and exposed to executor code as `request.history`; executors that prefer provider-side state may continue to ignore it.
- **Credentials never cross HTTP boundaries** — controller passes a Model reference (namespace + name) to the FileBackend; the FileBackend resolves the Model and its credentials itself using its own K8s API access, matching the existing executor pattern. No new credential exposure surface.
- **ark-api** exposes file upload, list, and delete routes that dispatch to the configured Workspace and stitch FileBackend projection state into list responses so the dashboard can surface readiness per provider in a single call.
- **Dashboard** chat composer gains an attach affordance backed by the workspace: pick an existing file or upload a new one (uploads land in the workspace and are referenced in the message in one motion). The attach flow eagerly triggers projection when the active agent's model provider is known.

## Capabilities

### New Capabilities

- `workspace-resource`: pluggable Workspace CRD and the contract its implementations satisfy (list, upload, download, delete; name + etag identity). Defines the URI scheme and namespace scoping.
- `file-backend-resource`: pluggable FileBackend CRD and the contract its implementations satisfy (project workspace URI to provider-native file id; cache lifecycle; failure semantics). Defines how a FileBackend is matched to a Model.
- `agent-file-input`: end-to-end behaviour of attaching files to a Query — input shape, controller projection at dispatch, memory FilePart preservation, executor responsibilities, ark-api routes, and dashboard UX.

### Modified Capabilities

None for v1. Query already accepts non-string input via `RawExtension`; memory broker storage contract stays unchanged (the `ark.file` content part lives inside the existing message shape).

## Impact

- `ark/api/v1alpha1/` — new `Workspace` and `FileBackend` types; `Model.spec.fileBackend` optional field; Query input shape documented.
- `ark/internal/controller/` — new projection step in the dispatch path: resolves Model + FileBackend, reads memory history, walks all `ark.file` parts, calls FileBackend per part, packages the projected message stream into the A2A dispatch.
- `ark/executors/completions/` — memory READ for dispatch removed (history arrives via A2A from controller); memory WRITES for assistant/tool outputs unchanged; consumes pre-projected provider-native parts.
- `services/ark-broker/` — broker storage contract unchanged. The `ark.file` content part travels as opaque data inside `Message = unknown`.
- `services/ark-api/` — `/v1/files/*` routes dispatching to Workspace and stitching FileBackend state.
- `services/ark-dashboard/` — chat composer attach UI + workspace picker.
- `lib/ark-sdk/` — `ExecutorApp` base receives pre-projected messages via A2A; no FileBackend awareness needed in executor code.
- **Marketplace (separate repo)** — file-gateway gains a `Workspace` CR template; a new `ark-openai-files` FileBackend service ships as the first projection backend, with K8s RBAC to read Models and resolve credentials in its namespace.

Out of scope for v1: Agent- and Team-scoped attachments (deferred until per-message scope is real in production); cross-provider file portability beyond what falls out of memory replay; content-addressable storage.

## Open Design Questions

Captured here so design.md can resolve them next:

- **A. Matching FileBackend to Model.** By Model.spec.provider field, an explicit Model.spec.fileBackend reference, or a default-per-provider label?
- **B. Workspace scoping.** Namespace-scoped (assumed); 0-or-1 per namespace, or multiple with explicit selection?
- **C. Upload API shape.** Streaming through ark-api vs presigned redirect to Workspace; eager projection trigger semantics.
- **D. URI scheme details.** `ark://workspace/<name>/<path>` vs simpler forms; cross-namespace and RBAC implications.
- **E. Core vs marketplace boundary.** Confirm: CRDs, controller projection, memory FilePart support, ark-api routes ship in core; all backends ship in marketplace; an in-memory test workspace exists for core e2e.
