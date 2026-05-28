## 1. CRDs and webhooks

- [ ] 1.1 Add `Workspace` type to `ark/api/v1alpha1/` with `spec.address` (ValueSource), `spec.maxFileBytes` (int, optional), `spec.denyList` (array of MIME strings, optional), and `status.conditions`
- [ ] 1.2 Add `FileBackend` type to `ark/api/v1alpha1/` with `spec.provider`, `spec.address`, `spec.constraints` (maxFileBytes, acceptedMimeTypes, notes), and `status.conditions`
- [ ] 1.3 Add `Model.spec.fileBackend` optional field (object with `name` only for v1)
- [ ] 1.4 Regenerate deepcopy + CRD manifests via `make manifests` + sync into `ark/chart/`
- [ ] 1.5 Validating webhook: reject second Workspace per namespace; error names the existing Workspace
- [ ] 1.6 Validating webhook: reject second FileBackend with same `spec.provider` per namespace; error names the existing FileBackend and suggests `Model.spec.fileBackend` override

## 2. Controller — projection at dispatch

- [ ] 2.1 Add resolver in `ark/internal/controller/` that, given a Query and target Model, returns the FileBackend to use: explicit override > implicit provider match
- [ ] 2.2 Walk Query.spec.input message parts; for each FilePart, resolve workspace URI to current etag via Workspace HTTP `GET /files/<path>`
- [ ] 2.3 Call FileBackend `POST /v1/projections` with `{ workspace_uri, etag, mime, credentials }` (credentials and MIME sourced from Model config and workspace metadata respectively); cache short-lived response in-memory for the dispatch span
- [ ] 2.4 Substitute FileParts in dispatched A2A message with the `part` envelope returned by the FileBackend (controller stays MIME-agnostic; the backend chose the right part shape)
- [ ] 2.5 On any projection failure (no backend, service error, MIME rejection), set Query status condition `ProjectionFailed` / `FileBackendUnavailable` with actionable message and transition Query to Error phase
- [ ] 2.6 Parallel projection for multi-FilePart Queries

## 3. Controller — reconcilers

- [ ] 3.1 Workspace reconciler: poll the referenced service's health endpoint; maintain `status.conditions[Ready]`
- [ ] 3.2 FileBackend reconciler: poll the referenced service's health endpoint AND check for a Workspace CR in the same namespace; set Ready=False/NoWorkspace when absent, Ready=False/Unhealthy when service is down, Ready=True only when both pass

## 4. Memory — FilePart preservation

- [ ] 4.1 Change canonical message storage in `services/ark-broker/` to use an A2A-shaped parts array (preserving FilePart entries with their URIs and mime types)
- [ ] 4.2 Keep OpenAI-flat as a derived view: provide a transform function used by consumers (completions executor) that flattens to OpenAI message shape at read time
- [ ] 4.3 Verify FileParts survive a write-read round-trip via unit tests
- [ ] 4.4 Ensure persistence layer (json-file-store) round-trips the new shape

## 5. ark-api — /v1/files routes

- [ ] 5.1 Create `services/ark-api/ark-api/src/ark_api/api/v1/files.py` with the 6 endpoints
- [ ] 5.2 Workspace resolver: read Workspace CR in caller's namespace; fall back to built-in default
- [ ] 5.3 Multipart streaming proxy from ark-api to workspace service
- [ ] 5.4 Path sanitization implementing the 12 rules from spec
- [ ] 5.5 Stitched listing: combine workspace list with each FileBackend's `/v1/capabilities` (compatibility) and `/v1/projections` (cached state)
- [ ] 5.6 Prewarm: fire-and-forget POST to matching FileBackend after upload; do not block response
- [ ] 5.7 Synchronous prewarm endpoint `POST /v1/files/<path>/prewarm`
- [ ] 5.8 Delete fanout: workspace delete first; then best-effort delete to each FileBackend; return `projections_cleaned` summary
- [ ] 5.9 Wire ark-api dependencies: ImpersonationConfig (existing), Kubernetes client for CR resolution

## 6. ark-api — built-in default workspace

- [ ] 6.1 Implement a minimal Workspace-contract impl inside ark-api (in-process or PVC-backed; persistence decision per design.md open question)
- [ ] 6.2 Surface "default workspace; install file-gateway for persistent storage" banner field in list responses
- [ ] 6.3 Total capacity cap enforced; uploads beyond cap return 507
- [ ] 6.4 When a Workspace CR exists, route to it instead of the built-in; the built-in's stored files are NOT migrated (documented)

## 7. ark-api — RBAC

- [ ] 7.1 SubjectAccessReview checks against `workspaces/files` subresource for each route per spec
- [ ] 7.2 Ship `ark-workspace-user` ClusterRole template in `ark/chart/`
- [ ] 7.3 Update read-only ark-api role (if any) to include `GET` on `workspaces/files`

## 8. ark-sdk

- [ ] 8.1 Document that translated provider-native parts arrive at `ExecutorApp` already in OpenAI message shape (no executor change needed for default behavior)
- [ ] 8.2 Optional helper for custom executors that want to call their own FileBackend (low priority; can be added when a marketplace executor needs it)

## 9. Dashboard

- [ ] 9.1 Add chat composer attach affordance with "From workspace" picker + "Upload new" flow; show file pills before send
- [ ] 9.2 When active agent's Model provider is known, uploads from the composer pass `prewarm=<provider>`
- [ ] 9.3 Hide the attach affordance when no Workspace is reachable AND built-in is unavailable; show install guidance link
- [ ] 9.4 Update Files page to render stitched listing with per-backend compatibility + projection state badges
- [ ] 9.5 FileBackend list view shows `Ready` conditions; surface "NoWorkspace" state with actionable text
- [ ] 9.6 Regenerate types.ts from updated OpenAPI

## 10. Test infrastructure (in-tree)

- [ ] 10.1 `test-workspace` service: minimal in-memory impl of Workspace HTTP contract, deployed to chainsaw test cluster
- [ ] 10.2 `test-filebackend` service: minimal in-memory impl of FileBackend HTTP contract; supports a configurable "openai-like" provider name
- [ ] 10.3 Helm chart for both test services, used only by e2e test setup

## 11. Chainsaw e2e tests

- [ ] 11.1 Happy path: install test-workspace + test-filebackend, upload via /v1/files, create Query with FilePart, verify executor received provider-native part
- [ ] 11.2 Multi-turn session: upload + Query1 + Query2 (same conversationId, no re-attach) verifies replay surfaces FilePart
- [ ] 11.3 Provider switch: upload + Query targeting provider-A + Query targeting provider-B; both projections happen, both succeed
- [ ] 11.4 Failure: Query with FilePart but no FileBackend installed; Query goes to Error with `FileBackendUnavailable`
- [ ] 11.5 Validation: second Workspace creation rejected; second FileBackend (same provider) rejected
- [ ] 11.6 Overwrite: upload, project, overwrite, next projection uses new etag and new provider id
- [ ] 11.6a Image attachment: upload PNG, attach to Query targeting vision-capable model, verify executor receives image_url part (not input_file)
- [ ] 11.7 Delete fanout: upload, project, delete; verify backend's `DELETE /v1/projections/<id>` was called
- [ ] 11.8 RBAC: caller without `CREATE workspaces/files` gets 403 on upload

## 12. Unit tests

- [ ] 12.1 Controller projection unit tests (FileBackend resolution, override precedence, parallel projection)
- [ ] 12.2 Webhook unit tests (Workspace uniqueness, FileBackend provider uniqueness, Model.spec.fileBackend acceptance)
- [ ] 12.3 ark-api files router unit tests (sanitization rules, prewarm fire-and-forget, delete fanout, stitched listing)
- [ ] 12.4 Memory broker unit tests for FilePart round-trip

## 13. Docs

- [ ] 13.1 New page: "Attaching files to queries" (user guide)
- [ ] 13.2 New page: "Workspace and FileBackend concepts" (architecture)
- [ ] 13.3 URI scheme reference
- [ ] 13.4 RBAC how-to (ClusterRole + RoleBinding examples)
- [ ] 13.5 Marketplace install guide (file-gateway + ark-openai-files)
- [ ] 13.6 Migration note: existing file-gateway installs gain Workspace CR via chart upgrade; no data migration

## 14. Marketplace (separate repo; coordinated PRs)

- [ ] 14.1 file-gateway chart: add Workspace CR template referencing the existing file-api Service
- [ ] 14.2 file-gateway file-api: tighten response shapes to match the documented Workspace contract (uri/etag/size/mime)
- [ ] 14.3 New chart: `ark-openai-files` with FastAPI service implementing `/v1/projections`, `/v1/capabilities`, `DELETE /v1/projections/<id>`; cache via sqlite or in-memory; ship FileBackend CR template with `spec.provider: openai` and constraints populated. **Must support both documents (input_file) and images (image_url/input_image) based on MIME type** — the projection response includes a `part` envelope ready to substitute. Backend chooses inline data URL vs hosted file_id for images based on file size and configured policy. Initial target API surface: Chat Completions (matching the completions executor); structure code so Responses API support can be added later.
- [ ] 14.4 Declare minimum ark-core version on both charts
- [ ] 14.5 Marketplace docs and devspace bundles updated
