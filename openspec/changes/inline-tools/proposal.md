## Why

Small custom tools should not require an author to build an image, publish it, and deploy an MCP server before trying an agent. Inline tools provide a short-script path for demos and PoCs; `MCPServer` remains the option for dependencies, external access, secrets, or larger services.

This change addresses issue #1161 and supersedes the earlier proposal in PR #2116. It defines the implementation contract; it does not implement the runtime.

## What Changes

- Add `type: inline` and `spec.inline.{source,language}` to the existing `Tool` resource. Source is required and limited to 64 KiB of UTF-8; language is explicitly `bash`, `python`, `node`, or `ts`. Reuse `spec.inputSchema` and `Agent.spec.tools`.
- Reconcile a separate hardened runner Deployment, Service, ServiceAccount, NetworkPolicy, and stable source ConfigMap per Tool. Unused runners have zero replicas; source edits update the ConfigMap and trigger a revision-checked rollout.
- Publish an internal activator address on Tool status. Small adapters in the Go executor and Python SDK resolve inline Tools into existing MCP client/configuration types. Do not create synthetic MCPServer resources or duplicate Tools.
- Serve MCP initialization and discovery from Tool metadata without starting runners. Only `tools/call` activates a runner; it scales back to zero after 60 seconds without pending or active calls. Use stateless MCP Streamable HTTP and the existing invocation, tracing, and event paths.
- Publish per-language runner images with a shared static Go runner: Alpine with bash/jq/coreutils, and distroless Python/Node/TypeScript images. Scripts use standard libraries only; there is no package-install or custom-image interface.
- Pass bounded JSON arguments as one literal argument after the script path, never shell-interpolated. Return bounded UTF-8 text through MCP; enforce a 30-second execution deadline and bounded output capture.
- Keep inline authoring off by default. Require a namespace-scoped dedicated author permission on create and spec updates, with mandatory fail-closed enforcement in both CRD admission and the PostgreSQL-backed API server. API/dashboard writes require authenticated user impersonation without service-account fallback, including generic resource writes.
- Follow the existing tool execution authorization model: resource access under the query/executor identity, attachment/allowlist rules, and applicable approval flows. Do not introduce an inline-only per-user invocation permission. Keep activator and runner endpoints internal with restricted ingress.
- Enforce pod hardening and verify effective network isolation in each runner policy context before execution. Document node-level PID exhaustion as a residual risk and administrator-configured per-pod PID limits as a best practice, not an Ark-managed setting or enablement gate.
- Deliver dashboard authoring first through the existing Add Tool flow, with required Source/Language fields, persisted edit support, and a language badge. Until the runtime is installed and verified, show Pending and explicitly say the tool is not executable.

## Capabilities

### New Capabilities

- `inline-tools`: authoring, admission, controller lifecycle, activator, runner contract, and API/dashboard support for inline Tools.

### Modified Capabilities

- `mcp-server-resolution`: include inline Tools as resolved MCP connections for named executors, without requiring MCPServer resources; preserve existing MCP grouping and allowlists.
- `api-impersonation`: require authenticated user impersonation for inline authoring writes and prohibit fallback for those writes. Other resource operations retain their existing behavior.

## Impact

- `ark/api/v1alpha1/tool_types.go`, `ark/config/crd/bases/`, and `ark/dist/chart/templates/crd/` — add the inline shape and runtime status fields; regenerate and synchronize schemas.
- `ark/internal/validation/`, `ark/internal/webhook/v1/tool_webhook.go`, and `ark/internal/apiserver/admission.go` — share structural validation and author-policy decisions across both storage backends, with authenticated identity adapters for each admission path.
- Controller/apiserver Helm and RBAC — wire `inlineTools.enabled` (default false), explicit author grants, non-bypassable admission, and least-privilege child-object management. Do not automatically grant inline authorship to existing Tool editors or ark-api's service account.
- `ark/internal/controller/tool_controller.go` and new `ark/internal/inlinetoolactivator/` — reconcile child resources and status, serve metadata-only discovery, activate runners, and handle idle, edit, disable, and delete transitions. Package the activator as a singleton deployment alongside the operator, independently of controller replicas.
- `ark/executors/completions/agent_tools.go` and `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/query.py` — adapt inline resolution into existing MCP types. Preserve the shared factory path used by direct Tool queries and the SDK's existing resolution identity.
- New `ark/images/inline-runner/` — common runner, language-specific images, smoke tests, and signed image publication using existing build tooling.
- `services/ark-api/` — update handwritten Tool DTOs and serialization as well as generated SDK types; cover create/update/read/list and generic resource admission paths.
- `services/ark-dashboard/` — extend the current tool form and `lib/services/tools.ts` mapping, support persisted source edits, and expose language/status without returning source in list projections.
- `docs/` and `samples/inline-tools/` — runnable in-memory examples, authoring guidance, runtime limits, identity/network prerequisites, PID-risk guidance, and safe disable/rollback steps.

v1 excludes bundled scripts, custom images, third-party dependencies, remote source references, file mounts, cross-namespace attachments, streaming results, per-tool security relaxation, and a new invocation authorization system. `keepWarm`, configurable limits/timeouts, richer editors, and CLI authoring shortcuts are deferred. Implementation sequencing and checks are in `tasks.md`.
