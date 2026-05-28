## Why

Users cannot upload files to Ark and have an agent reason over them. Inline base64 (#1835) does not scale past small payloads, and the OpenAI Files API path that downstream LLM providers expect (file_id referenced as `input_file`) has no Ark-side primitive. Issue #2051 captures the gap: there is no way to attach a PDF, image, or document to a Query and have it reach the configured Model.

The change introduces an end-to-end file-input path that is composable with Ark's "everything is pluggable" stance: a workspace abstraction (where bytes live), a provider-specific file backend (where projections are cached), and a per-message attachment representation that flows through the existing A2A and memory layers without inventing parallel mechanisms.

## What Changes

- A new pluggable **Workspace** resource type representing the canonical store of user-uploaded bytes. Implementations are installed via marketplace (e.g. file-gateway as S3-backed). 0 or 1 may be configured per namespace; the file-input feature is dark when none is installed.
- A new pluggable **FileBackend** resource type representing a provider-side projection target (e.g. OpenAI Files API). 0+ may be installed; each is matched to Models that share its provider. Each backend owns its own `(workspace_uri, etag) → provider_file_id` cache.
- **Query.spec.input** accepts A2A-shaped message parts (text + FilePart-with-URI), reusing the existing protocol primitive. URIs identify files in the configured Workspace (scheme `ark://workspace/<name>/<path>`).
- **Memory storage** preserves FileParts faithfully so that sessions inherit attachment context automatically — replays trigger cache-hit re-projection rather than re-upload. The memory canonical shape becomes provider-agnostic; provider-formatted views are derived at executor time.
- **Controller** translates FilePart URIs into provider-native parts at dispatch by calling the matching FileBackend. Executors receive clean provider-native messages. Failure to project rejects the Query with an actionable status condition.
- **ark-api** exposes file upload, list, and delete routes that dispatch to the configured Workspace and stitch FileBackend projection state into list responses so the dashboard can surface readiness per provider in a single call.
- **Dashboard** chat composer gains an attach affordance backed by the workspace: pick an existing file or upload a new one (uploads land in the workspace and are referenced in the message in one motion). The attach flow eagerly triggers projection when the active agent's model provider is known.

## Capabilities

### New Capabilities

- `workspace-resource`: pluggable Workspace CRD and the contract its implementations satisfy (list, upload, download, delete; name + etag identity). Defines the URI scheme and namespace scoping.
- `file-backend-resource`: pluggable FileBackend CRD and the contract its implementations satisfy (project workspace URI to provider-native file id; cache lifecycle; failure semantics). Defines how a FileBackend is matched to a Model.
- `agent-file-input`: end-to-end behaviour of attaching files to a Query — input shape, controller projection at dispatch, memory FilePart preservation, executor responsibilities, ark-api routes, and dashboard UX.

### Modified Capabilities

None for v1. Query already accepts non-string input via `RawExtension`; memory storage changes are additive (richer canonical form, OpenAI-shape becomes a derived view).

## Impact

- `ark/api/v1alpha1/` — new `Workspace` and `FileBackend` types; Query input shape documented.
- `ark/internal/controller/` — projection translation step in the dispatch path; FileBackend resolution by Model provider.
- `ark/executors/completions/` — consume A2A FilePart inputs already translated to provider-native parts.
- `services/ark-broker/` — memory broker stores canonical message shape; FileParts round-trip.
- `services/ark-api/` — `/v1/files/*` routes dispatching to Workspace and stitching FileBackend state.
- `services/ark-dashboard/` — chat composer attach UI + workspace picker.
- `lib/ark-sdk/` — `ExecutorApp` base receives translated parts; helpers for custom executors that want to handle their own backends.
- **Marketplace (separate repo)** — file-gateway gains a `Workspace` CR template; a new `openai-files` FileBackend service ships as the first projection backend.

Out of scope for v1: Agent- and Team-scoped attachments (deferred until per-message scope is real in production); cross-provider file portability beyond what falls out of memory replay; content-addressable storage.

## Open Design Questions

Captured here so design.md can resolve them next:

- **A. Matching FileBackend to Model.** By Model.spec.provider field, an explicit Model.spec.fileBackend reference, or a default-per-provider label?
- **B. Workspace scoping.** Namespace-scoped (assumed); 0-or-1 per namespace, or multiple with explicit selection?
- **C. Upload API shape.** Streaming through ark-api vs presigned redirect to Workspace; eager projection trigger semantics.
- **D. URI scheme details.** `ark://workspace/<name>/<path>` vs simpler forms; cross-namespace and RBAC implications.
- **E. Core vs marketplace boundary.** Confirm: CRDs, controller projection, memory FilePart support, ark-api routes ship in core; all backends ship in marketplace; an in-memory test workspace exists for core e2e.
