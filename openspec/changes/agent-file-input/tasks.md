## 1. CRDs and webhooks

- [ ] 1.1 Add `Workspace` type to `ark/api/v1alpha1/` with `spec.address` (ValueSource — same shape as MCPServer.spec.address), `spec.maxFileBytes` (int, optional), `spec.denyList` (array of MIME strings, optional), and `status.conditions`
- [ ] 1.2 Add `FileBackend` type to `ark/api/v1alpha1/` with `spec.provider`, `spec.address` (ValueSource), `spec.constraints` (maxFileBytes, acceptedMimeTypes, targetApis, notes), and `status.conditions`
- [ ] 1.3 Add `Model.spec.fileBackend` optional field (object with `name` only for v1; namespace inferred as same-namespace)
- [ ] 1.4 Regenerate deepcopy + CRD manifests via `make manifests` + sync into `ark/chart/`
- [ ] 1.5 Validating webhook: reject second Workspace per namespace; error names the existing Workspace
- [ ] 1.6 Validating webhook: reject second FileBackend with same `spec.provider` per namespace; error names the existing FileBackend and suggests `Model.spec.fileBackend` override
- [ ] 1.7 Validating webhook: reject Model with `spec.fileBackend.name` if no FileBackend with that name exists in the same namespace (advisory — controller will surface the same error at dispatch with more context)

## 2. Controller — projection at dispatch

- [ ] 2.1 Add resolver in `ark/internal/controller/` that, given a Query and target Model, returns the FileBackend to use: explicit `Model.spec.fileBackend` override > implicit provider match. Defensive tiebreaker on duplicate FileBackends: pick oldest creationTimestamp; emit Event.
- [ ] 2.2 Add memory read for dispatch: load conversation history by `conversationId` from the broker before walking parts (limited reversal of c5dc1455's executor extraction — see design.md)
- [ ] 2.3 Add controller-side memory WRITE for the new user message (with `ark.file` content parts intact, pre-projection) so subsequent turns can replay it
- [ ] 2.4 Walk every message in the read stream; for each `ark.file` content part, call workspace `GET /files/<key>` to resolve current etag + mime
- [ ] 2.5 Call FileBackend `POST /v1/projections` with `{ workspace_uri, etag, mime, model_ref: { namespace, name } }` — model_ref is a REFERENCE, never resolved credentials. Concurrent calls per dispatch.
- [ ] 2.6 Substitute each `ark.file` content part in the dispatched A2A message stream with the `part` envelope returned by the FileBackend (controller stays MIME-agnostic; backend chose the right part shape)
- [ ] 2.7 Package the projected message stream into the A2A Task's `history` field so the executor receives it without its own memory read
- [ ] 2.8 On any projection failure (no backend, service error, MIME rejection, missing workspace file), set Query status condition `ProjectionFailed` / `FileBackendUnavailable` with actionable message and transition Query to Error phase

## 3. Controller — reconcilers

- [ ] 3.1 Workspace reconciler: poll the referenced service's health endpoint; maintain `status.conditions[Ready]`
- [ ] 3.2 FileBackend reconciler: poll the referenced service's health endpoint AND check for a Workspace CR in the same namespace; set Ready=False/NoWorkspace when absent, Ready=False/Unhealthy when service is down, Ready=True only when both pass
- [ ] 3.3 Defensive duplicate handling: if two Workspaces or two same-provider FileBackends exist (webhook race), pick oldest creationTimestamp and emit Kubernetes Events on the losers

## 4. Memory — `ark.file` content part travels in the existing shape

- [ ] 4.1 No changes to the broker's storage contract — `Message = unknown` already accepts arbitrary content; document that `ark.file` content parts are part of the v1 message-shape vocabulary
- [ ] 4.2 Update services/ark-broker/CLAUDE.md to note that `ark.file` content parts are an Ark-internal vocabulary; the broker doesn't interpret them, the controller does
- [ ] 4.3 Unit test that a message containing `{"role":"user","content":[{"type":"ark.file","uri":"..."}]}` round-trips through the broker unchanged (write, read, list, persistence)

## 5. Completions executor — memory split

- [ ] 5.1 Extract the Go memory client from `ark/executors/completions/memory_http.go` into a shared package (e.g., `ark/internal/memory/client/`) usable by both the controller (new dispatch reader) and the completions executor (existing writer)
- [ ] 5.2 Remove dispatch-time memory READ from the completions executor — history arrives via A2A Task `history` field from the controller
- [ ] 5.3 Retain memory WRITE for assistant and tool outputs (no change)
- [ ] 5.4 Verify the executor never sees `ark.file` content parts in dispatched messages (defense-in-depth assertion: if it does, log a warning and treat as text fallback — should never happen in correct controller behavior)
- [ ] 5.5 No-op for marketplace executors that don't read broker memory today (e.g., openai-responses uses `previous_response_id`); they MAY adopt `request.history` over time but are not blocked on it for v1

## 6. ark-api — /v1/files routes

- [ ] 6.1 Create `services/ark-api/ark-api/src/ark_api/api/v1/files.py` with the 6 endpoints (POST /v1/files, GET /v1/files, GET /v1/files/<path>, GET /v1/files/<path>/content, DELETE /v1/files/<path>, POST /v1/files/<path>/prewarm)
- [ ] 6.2 Workspace resolver: read Workspace CR in caller's namespace; return 404 with marketplace guidance if absent (no built-in default workspace — E5-auto-4)
- [ ] 6.3 Multipart streaming proxy from ark-api to workspace service
- [ ] 6.4 Path sanitization implementing the rules from spec
- [ ] 6.5 Stitched listing: combine workspace list with each installed FileBackend's `/v1/capabilities` (compatibility) and `/v1/projections` (cached state). Per-file projection-state lookups MAY be batched per-backend; v1 accepts O(workspace_files × backends) calls for the listing.
- [ ] 6.6 Prewarm: fire-and-forget POST to matching FileBackend after upload; do not block response
- [ ] 6.7 Synchronous prewarm endpoint `POST /v1/files/<path>/prewarm`
- [ ] 6.8 Delete fanout: workspace delete first; then best-effort delete to each FileBackend; return `projections_cleaned` summary
- [ ] 6.9 Wire ark-api dependencies: ImpersonationConfig (existing), Kubernetes client for CR resolution

## 7. ark-api — RBAC (matches existing pattern)

- [ ] 7.1 Gate each `/v1/files` route via an impersonated K8s API call on the caller's behalf — same pattern as queries.py / agents.py. Inspect 403 from impersonation_errors.py and surface as HTTP 403.
- [ ] 7.2 Verb mapping per spec: LIST/GET/POST/DELETE all gate on impersonated `get` of `workspaces.ark.mckinsey.com`; prewarm additionally requires `get` on `filebackends.ark.mckinsey.com`
- [ ] 7.3 Ship `ark-workspace-user` ClusterRole template in `ark/chart/` granting `get` on `workspaces.ark.mckinsey.com` and `filebackends.ark.mckinsey.com`
- [ ] 7.4 NOT building: SubjectAccessReview path, custom subresource — design.md explains why we match the existing impersonation pattern instead

## 8. ark-sdk

- [ ] 8.1 Add optional `history: list[Message] = []` field to `ExecutionEngineRequest` in `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor.py`
- [ ] 8.2 Update `resolve_query()` in `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/query.py` to populate `history` from the broker when `conversation_id` is set. The history SHALL be the controller-supplied projected message stream (received via A2A), NOT a direct broker read. (Implementation detail: the SDK reads what the controller put into the A2A Task `history` field; alternatively, if `resolve_query` runs in a context that has the projected stream from A2A, it uses that directly.)
- [ ] 8.3 Document that external executors via `ExecutorApp` receive their conversation history via `request.history`, already projected by the controller. No FileBackend awareness needed in executor code.
- [ ] 8.4 Document that executors using provider-side conversation state (e.g., openai-responses' `previous_response_id`) MAY ignore `request.history` — the field is informational, not mandatory to consume.
- [ ] 8.5 ExecutorApp SHALL NOT load memory directly for the dispatch path (mirror of completions executor change). Memory writes for outputs via existing BrokerClient unchanged.

## 9. Dashboard

- [ ] 9.1 Add chat composer attach affordance with "From workspace" picker + "Upload new" flow; show file pills before send. Composer constructs user messages with `ark.file` content parts.
- [ ] 9.2 When active agent's Model provider is known, uploads from the composer pass `prewarm=<provider>`
- [ ] 9.3 Hide the attach affordance when no Workspace is configured in the namespace; show install guidance link
- [ ] 9.4 Update Files page to render stitched listing with per-backend compatibility + projection state badges
- [ ] 9.5 FileBackend list view shows `Ready` conditions; surface "NoWorkspace" state with actionable text
- [ ] 9.6 Regenerate types.ts from updated OpenAPI

## 10. Test infrastructure (in-tree)

- [ ] 10.1 `test-workspace` service: minimal in-memory impl of Workspace HTTP contract, deployed to chainsaw test cluster
- [ ] 10.2 `test-filebackend` service: minimal in-memory impl of FileBackend HTTP contract; deployable twice with different `spec.provider` values so provider-switch scenarios are testable; reads Model CR via K8s API (same pattern as production backend) to verify the credential-resolution flow
- [ ] 10.3 Helm chart for both test services, used only by e2e test setup
- [ ] 10.4 ServiceAccount + Role for test-filebackend granting `get` on `models` and relevant Secrets in the test namespace

## 11. Chainsaw e2e tests

- [ ] 11.1 Happy path: install test-workspace + test-filebackend, upload via /v1/files, create Query with `ark.file`, verify executor received provider-native part in A2A history
- [ ] 11.2 Multi-turn session: upload + Query1 + Query2 (same conversationId, no re-attach) verifies controller replays history and re-projects `ark.file`
- [ ] 11.3 Provider switch: install two test-filebackends with different provider names; upload + Query targeting provider-A + Query targeting provider-B; verify both projections happen and both executor receives differ
- [ ] 11.4 Failure: Query with `ark.file` but no FileBackend installed; Query goes to Error with `FileBackendUnavailable`
- [ ] 11.5 Validation: second Workspace creation rejected; second FileBackend (same provider) rejected
- [ ] 11.6 Overwrite: upload, project, overwrite, next projection uses new etag and new provider id; old projection evicted from cache
- [ ] 11.7 Image attachment: upload PNG, attach to Query targeting vision-capable model, verify executor receives image-shaped part (not input_file)
- [ ] 11.8 Delete fanout: upload, project, delete; verify backend's `DELETE /v1/projections/<id>` was called
- [ ] 11.9 RBAC: caller without `get` on `workspaces.ark.mckinsey.com` gets 403 on `/v1/files`
- [ ] 11.10 No Workspace CR present: `/v1/files` returns 404 with marketplace guidance
- [ ] 11.11 Credential rotation does not invalidate FileBackend cache (rotate the Secret backing a Model's apiKey; verify subsequent projection returns cached file_id rather than re-uploading)
- [ ] 11.12 Credentials never appear in HTTP bodies: inspect the projection request between controller and FileBackend; assert no resolved apiKey value is present

## 12. Unit tests

- [ ] 12.1 Controller projection unit tests (FileBackend resolution, override precedence, parallel projection, projection-scope-is-conversation-bounded)
- [ ] 12.2 Controller memory-read for dispatch unit test (history arrives in projected form via A2A)
- [ ] 12.3 Webhook unit tests (Workspace uniqueness, FileBackend provider uniqueness, Model.spec.fileBackend acceptance)
- [ ] 12.4 ark-api files router unit tests (sanitization rules, prewarm fire-and-forget, delete fanout, stitched listing, 404 when no Workspace)
- [ ] 12.5 Memory broker unit test for `ark.file` content part round-trip (write + read + persistence)
- [ ] 12.6 Completions executor unit test: confirms dispatch-time memory read removed; A2A `history` field consumed

## 13. Docs

- [ ] 13.1 New page: "Attaching files to queries" (user guide)
- [ ] 13.2 New page: "Workspace and FileBackend concepts" (architecture) — explain the Workspace/FileBackend split, the `ark.file` content part vocabulary, the controller-as-single-translator pattern, and the credential resolution flow
- [ ] 13.3 URI scheme reference
- [ ] 13.4 RBAC how-to (ClusterRole + RoleBinding examples)
- [ ] 13.5 Marketplace install guide (file-gateway + ark-openai-files); explicit "install file-gateway first" sequencing
- [ ] 13.6 Migration note: existing file-gateway installs gain Workspace CR via chart upgrade; no data migration
- [ ] 13.7 Note in `services/ark-broker/CLAUDE.md` updates: `ark.file` content part is part of the vocabulary; OpenAI-coupling note remains accurate for v1

## 14. Marketplace (separate repo; coordinated PRs)

- [ ] 14.1 file-gateway chart: add Workspace CR template referencing the existing file-api Service
- [ ] 14.2 file-gateway file-api: tighten response shapes to match the documented Workspace contract (uri/etag/size/mime)
- [ ] 14.3 New chart: `ark-openai-files` with FastAPI service implementing `POST /v1/projections`, `GET /v1/projections` (read-only, used by ark-api listing), `DELETE /v1/projections/<id>`, `GET /v1/capabilities`. Cache via sqlite or in-memory keyed by `(workspace_uri, etag, destination_id)` where `destination_id` is the OpenAI organization id resolved via `GET /v1/organization`. Local credential→destination_id resolution cache with TTL to avoid repeat API calls. Ship FileBackend CR template with `spec.provider: openai` and constraints populated. **Must support both documents (input_file) and images (image_url/input_image) based on MIME type** — the projection response includes a `part` envelope ready to substitute. Backend chooses inline data URL vs hosted file_id for images based on file size and configured policy. Initial target API surface: Chat Completions; structure code so Responses API support can be added later. **Service reads Model CR + Secrets directly via K8s API** — credentials are NEVER passed in HTTP bodies from ark-controller; the projection request body contains `model_ref` only.
- [ ] 14.4 ark-openai-files chart ships ServiceAccount + Role granting `get` on `models.ark.mckinsey.com` and on Secrets in its namespace (mirrors the completions executor's RBAC pattern)
- [ ] 14.5 Declare minimum ark-core version on both charts
- [ ] 14.6 Marketplace docs and devspace bundles updated
