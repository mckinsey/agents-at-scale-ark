## 1. Phase 1: schema and mandatory author admission

- [x] 1.1 Add the inline Tool shape and the new `ToolStatus` fields (`resolvedAddress` and `conditions`, with an `Available` condition type and the closed reason set covering both the `True` case and the failure cases, plus a `Pending` value for the existing `state`), and deep-copy support; regenerate CRDs, Helm copies, SDK models, and API types. Existing `state`/`message` behaviour for other Tool types stays unchanged.
- [x] 1.2 Add shared structural validation for language, UTF-8 source size, object input schemas, subtype exclusivity, and delete/recreate-only inline type transitions; test boundary and multibyte cases.
- [x] 1.3 Implement the namespace-scoped author policy with complete authenticated identity and fail-closed SubjectAccessReview handling; stamp the admitted subject and timestamp annotations through a mutating admission path for Tool, which does not exist yet (the Tool webhook is validating only and `validation.ApplyDefaults` has no `Tool` case, so both a mutating webhook entry and that case are needed), and emit an event on source change through the existing eventing provider; test grants, denied/error/timeout results, namespace mismatch, and that a requester cannot forge the authorship annotations.
- [x] 1.4 Wire mandatory inline security admission into CRD and PostgreSQL paths with `inlineTools.enabled` defaulting false; test skip labels, fail-open settings, optional plugins, authentication-disabled mode, PATCH/apply, status, metadata, and deletion behavior.
- [x] 1.5 Add least-privilege RBAC and explicit administrator binding examples without extending existing Tool-editor or ark-api author privileges; verify both backend chart configurations reject unchecked inline writes.
- [x] 1.6 Add the authoring-only controller path: inline Tools remain Pending with a runtime-not-installed reason and no runners/endpoints; test that other Tool types retain existing behavior.

## 2. Phase 1: API and dashboard authoring

- [x] 2.1 Extend handwritten Tool request/response models and serialization for source/language roundtrips, and fix the existing bug where `ToolSpec` omits `mcp`/`builtin` while `update_tool` replaces `spec` wholesale, so a typed PUT silently drops those blocks; regression-test an `mcp` and a `builtin` Tool surviving a typed update; add language-only list metadata and test create, GET, PUT, list, and delete in the selected namespace.
- [x] 2.2 Require authenticated user impersonation without fallback for inline authoring in typed Tool and generic resource write paths; test both old/new objects, API keys, missing identity, disabled impersonation, denial with fallback enabled, and unchanged non-inline behavior.
- [ ] 2.3 Extend the existing tool form and service mapping with Inline, required language, a monospace source textarea, UTF-8 byte validation, and exact source preservation; add persisted edit/reopen support without a new editor dependency.
- [ ] 2.4 Add the inline/language badge, give inline Tools their own list Type value in `getToolTypeKey`/`TOOL_TYPE_LABELS` rather than the `built-in` default, and read the `Available` condition by walking `status.conditions` as `a2a-servers.ts` does, then branch on its `reason`, which is new dashboard behaviour, so a policy conflict, a missing runtime, and an unavailable activator read differently, with the explicit not-yet-executable message; verify the list does not fetch every script body.
- [ ] 2.5 Add API/form tests and a dashboard flow covering authorized create/edit/reopen, source validation, admission denial, and honest Pending status. Consult `tests/CLAUDE.md` and the dashboard testing conventions before implementing tests.

## 3. Phase 2: runner contract and images

- [ ] 3.1 Build the shared static Go MCP runner with fixed interpreter dispatch and bounded literal JSON arguments; test malformed/non-object/oversized input, Unicode, nested values, and shell metacharacters without interpolation.
- [ ] 3.2 Implement bounded stdout/stderr draining, UTF-8 text results, truncation indicators, and MCP error results; test invalid encoding, multibyte truncation boundaries, non-zero exit, and sustained output without unbounded memory/logging.
- [ ] 3.3 Enforce execution/caller deadlines, cancellation, process-group termination, and child reaping; test hangs, orphan children, and children keeping output pipes open without using a node-exhausting fork bomb.
- [ ] 3.4 Build the bash/Python/Node/TypeScript images with pinned bases and the documented installed tools; smoke-test all four under the real non-root/read-only security and resource settings, including TypeScript syntax and any bounded scratch requirement.
- [ ] 3.5 Wire image builds, signing, and publication into existing tooling; document the language/image mapping and dependency limitations without per-tool image overrides.

## 4. Phase 2: owned resources and revision lifecycle

- [ ] 4.1 Reconcile the stable source ConfigMap, ServiceAccount, hardened Deployment with explicit requests below its limits, backend Service, and NetworkPolicy; test deterministic length-safe names, UID labels, owner references, collisions, and idempotency.
- [ ] 4.2 Implement source checksums, language-appropriate read-only snapshot mounts, startup revision checks, and current-generation status; test edits and child drift after the Tool is available, ConfigMap/template races, and no orphaned source ConfigMaps.
- [ ] 4.3 Keep initial runners at zero replicas without resetting active replicas during ordinary reconciliation; cover each `Available=False` reason including an unavailable activator, per-condition `observedGeneration`, and the distinction between available and warm.
- [ ] 4.4 Implement disable/delete cleanup and endpoint invalidation, with disable keeping the activator installed and reconciliation running while the controller drains and scales runners to zero; test that a scaled-up runner does not survive disable, and that uninstall is gated on no inline Tools remaining. Verify removal of owned objects with both storage backends and document cleanup-before-downgrade. Do not rely on envtest alone to prove garbage collection.

## 5. Phase 3: runner networking and activation

- [ ] 5.1 Reconcile the runner NetworkPolicy and detect conflicting policies by reading those selecting the runner's labels; test the optional tenant allow-all policy, the Pending reason naming it, recovery when it is narrowed, and re-evaluation after policy/label changes. Send no probe traffic and add no runtime enforcement gate.
- [ ] 5.2 Package a singleton activator alongside the operator using `strategy: Recreate`, with internal-only ingress restrictions and its own ServiceAccount, bound per namespace via RoleBindings honouring `controllerManager.watchNamespaces` as the controller's rules are, requiring a non-empty `controllerManager.watchNamespaces` and failing installation rather than falling back to a cluster-wide binding, limited to the `scale` subresource of owned runner Deployments with no Secret or Tool-spec write access; verify that controller replica count does not create multiple active scaling authorities and that a rollout never runs two activators.
- [ ] 5.3 Serve stateless MCP initialization, notifications, ping, and discovery from Tool metadata, advertising an empty-object schema for a Tool with no `inputSchema`; test that connecting/listing attached tools starts no runners, never exposes source, and does not refresh idle timers.
- [ ] 5.4 Implement valid-call activation with feature, published-endpoint, current UID/revision and ownership checks and backend connection after readiness; test stale routes, unknown tool names, arbitrary-target rejection, concurrent cold starts, and starting only the selected Tool.
- [ ] 5.5 Implement pending/active accounting, 60-second idle scale-down, separate activation/execution deadlines, and cancellation; test active-call protection, conservative restart recovery, no late execution after abandonment, and no replay after uncertain responses.

## 6. Phase 3: existing MCP execution integration

- [ ] 6.1 Adapt Go `CreateToolExecutor` to return the existing MCP executor for resolved inline Tools, qualifying the pooled client identity by Tool UID since `MCPClientPool` keys on server namespace and name alone; test agent attachments, direct Tool queries, and an inline Tool sharing a name with an MCPServer in one namespace, preserving supported aliases, partial arguments, approvals, and tool events.
- [ ] 6.2 Extend SDK `_build_mcp_servers` to emit inline `MCPServerConfig` entries with distinct connection identities and one-tool allowlists; test mixed types, ordinary MCP grouping, stale status, unavailable resources, and existing query/executor identity without privilege escalation.
- [ ] 6.3 Preserve MCP `isError` through shared result handling for existing MCP and inline Tools; test model-visible failure and existing error events without a separate inline invocation implementation.
- [ ] 6.4 Verify invocation requires no dedicated author grant or new per-user credential and does not bypass the execution engine's existing resource/allowlist/approval checks; retain ordinary HTTP/MCP authentication behavior.

## 7. Release validation and operator guidance

- [ ] 7.1 Add stdlib-only sample Tools and run the in-memory CSV example, including valid, empty/header-only, malformed-column, and non-finite-number cases; no example may depend on an unmounted file.
- [ ] 7.2 Add Chainsaw end-to-end coverage on an enforcing CNI for create/attach/discover/call/idle/edit/delete and negative egress, plus both-backend admission coverage. Test the dashboard-first state separately from the completed runtime.
- [ ] 7.3 Document author grants, user impersonation, the authorship annotations and event, existing execution permissions, internal endpoint access, the CNI-enforcement prerequisite and NetworkPolicy limitations, fixed limits, and troubleshooting with bounded stderr.
- [ ] 7.4 Document PID exhaustion as a residual risk and recommend provider-supported finite per-pod PID limits sized and tested by administrators. Do not add an Ark PID setting, verified-node-pool requirement, or PID-based execution gate.
- [ ] 7.5 Document staged rollout and safe disable/delete/downgrade; verify no synthetic MCPServer/duplicate Tool, public runner endpoint, automatic author grant, or misleading available state is introduced.
- [ ] 7.6 Run the required lint/test gates for every implementation stack touched, image smoke tests, and end-to-end checks; record remaining platform limitations before enabling execution.
