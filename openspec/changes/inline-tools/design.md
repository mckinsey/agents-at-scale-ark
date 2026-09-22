## Context

This proposal adds short scripts to the existing Tool model (issue #1161, superseding PR #2116). The current Tool controller only sets status; it owns no runtime objects. Inline is the first subtype for which Ark provisions the execution environment.

Two existing integration points need explicit changes: `CreateToolExecutor` in `ark/executors/completions/agent_tools.go` dispatches on Tool type, and `_build_mcp_servers` in the Python SDK currently drops non-MCP Tools. An endpoint alone does not make an inline Tool callable. MCP clients also connect before the model selects a tool, so discovery must not start runner pods.

## Goals / Non-Goals

**Goals**

- Author one script per Tool through YAML or the dashboard, without an author-built image or registry push.
- Preserve `Agent.spec.tools` and reuse existing MCP invocation, query/executor identity, applicable approval, tracing, and events.
- Keep attached-but-unused runners at zero pods; advertise only tool metadata, never script source, to the model.
- Make security responsibilities and deployment prerequisites explicit.
- Deliver dashboard authoring before runtime execution, without displaying a non-executable Tool as Ready.

**Non-goals**

- New author-facing resource kinds, bundled scripts, custom images, third-party package installation, remote sources, mounted reference files, cross-namespace attachments, or streaming results.
- Per-tool security relaxation, a new per-user invocation permission, or mandatory hostile-author sandboxing.
- PID-limit enforcement by Ark, dedicated node pools, configurable runtime limits, `keepWarm`, or a new editor dependency.

## Threat model

- **Trusted authors, hostile inputs.** Only subjects explicitly granted inline authorship can introduce or change scripts. Arguments and tool output may be adversarial; the runner guarantees bounded transport, not semantic safety. Authors must validate values and avoid interpreting input as code or trusting echoed content as model instructions.
- **Workload execution identity.** Invocation follows existing query/executor resource access and attachment/allowlist rules, not the human author's identity. The author permission is not required to invoke an existing Tool. Applicable human-approval flows remain in the executor; they are not a new endpoint authorization system.
- **Deployment administrators remain trusted.** They control runner infrastructure, pod labels, network policies, and service-account privileges. Network isolation is not cryptographic caller authentication, and a compromised allowed executor is inside the invocation trust boundary.
- **Activator privilege.** The activator is reachable from executor workloads and can scale runner Deployments in the namespaces it serves, so it is a privileged component on the invocation path. It is bound per namespace rather than cluster-wide, which requires a non-empty `controllerManager.watchNamespaces`, holds only the `scale` subresource on runners it owns, and accepts no caller-supplied backend target — but an administrator who widens its binding or its ingress widens that reach.
- **Residual node risks.** Non-root execution, dropped capabilities, bounded resources, and timeouts reduce risk but do not guarantee containment of PID exhaustion or a kernel escape. Protection against malicious authorized authors requires additional platform isolation outside v1.

## Decisions

### Extend Tool; keep one script per resource

Add `spec.inline` with required `source` (non-whitespace, at most 65,536 UTF-8 bytes) and required `language` (`bash`, `python`, `node`, `ts`). No shebang inference or language default. `spec.inline` is invalid on another type; inline Tools cannot carry other subtype configuration.

Reuse the existing input schema. Inline schemas describe a JSON object; an omitted schema is advertised as an empty-object schema. The dashboard requires an explicit schema for authoring, including an empty-object schema for no-argument tools. Existing non-inline validation is unchanged. Transitions into or out of inline require delete/recreate in v1, avoiding ambiguous child cleanup during type conversion.

This example accepts CSV content rather than a path: the isolated pod has no caller file mounts or network access.

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: Tool
metadata:
  name: csv-summarise
spec:
  type: inline
  description: Count CSV rows and sum the amount column
  inputSchema:
    type: object
    properties:
      csv: {type: string, description: CSV content with an amount column}
    required: [csv]
    additionalProperties: false
  inline:
    language: python
    source: |
      import csv
      import io
      import json
      import sys
      from decimal import Decimal

      args = json.loads(sys.argv[1])
      if not isinstance(args.get("csv"), str):
          raise ValueError("csv must be a string")
      reader = csv.DictReader(io.StringIO(args["csv"]))
      if not reader.fieldnames or "amount" not in reader.fieldnames:
          raise ValueError("CSV must contain an amount column")
      count = 0
      total = Decimal("0")
      for row in reader:
          amount = Decimal(row["amount"])
          if not amount.is_finite():
              raise ValueError("amount must be finite")
          count += 1
          total += amount
      print(json.dumps({"rows": count, "total": str(total)}))
```

Input `{"csv":"amount\n2\n3\n"}` produces `{"rows":2,"total":"5"}` as text. No pandas, local data file, or dependency installation is required.

### Adapt resolution; reuse MCP invocation

Use an internal resolved connection, not a synthetic MCPServer or duplicate Tool. A real MCPServer would trigger its controller's discovery polling and generated Tool creation unnecessarily.

```text
Tool + Agent.spec.tools
        |
        +-- Go CreateToolExecutor ------> existing MCPExecutor
        +-- SDK _build_mcp_servers -----> existing MCPServerConfig
                                              |
                           shared activator Service / namespace / Tool UID
                              | initialize, tools/list: metadata only
                              | tools/call: activate and forward
                              v
                           per-tool Service -> runner pod -> script
```

The controller publishes `status.resolvedAddress` and adds `status.conditions` to Tool, bringing it in line with Agent, Team, Query, Model, A2ATask, MCPServer, and A2AServer, the Ark CRDs that already carry conditions. `resolvedAddress` matches the existing `MCPServerStatus` field of the same name. A single `Available` condition carries usability — the type name Agent, Team, and MCPServer already use — with a machine-readable `reason` (`Available` for the true case, and `RuntimeNotInstalled`, `ConflictingNetworkPolicy`, `ActivatorUnavailable`, `ProvisioningFailed` for the false case) and the human detail in `message`. Its own `observedGeneration` states which generation the verdict applies to, so no top-level generation field is invented. `state` keeps its existing role as the coarse value for status indicators and gains `Pending` alongside `Ready`, the way Query pairs `phase` with condition messages. Reasons are a closed set: a new cause adds a reason, not a new field, and `kubectl wait --for=condition=Available` works on inline Tools. The address identifies namespace, name, and UID at the shared activator, not the runner Service. An available Tool may have zero runner pods. The endpoint is usable only for the current generation; adapters reject or skip unresolved Tools using their existing error-reporting conventions and never fall back to a caller-supplied URL.

- **Go:** add inline resolution at `CreateToolExecutor`, create the existing `MCPClientConfig`, and return `MCPExecutor`. This also covers direct Tool queries. Preserve existing attachment aliases, descriptions, partial arguments, and approval handling rather than bypassing registration.
- **Python SDK:** `_build_mcp_servers` emits the existing `MCPServerConfig` using the resolved activator URL, transport `http`, an identity derived from Tool UID, and a one-tool allowlist. Read the Tool under the existing query/executor identity. Named executor implementations still receive ordinary MCP connections; this does not add alias/partial/approval features they do not already support.
- **Names:** the original MCP tool name is the authored Tool name. Connection identities include namespace/UID and do not collide with ordinary MCPServer names. This is a correctness requirement on the Go path, not a cosmetic one: `MCPClientPool` keys clients by `ServerNamespace/ServerName` alone, so an inline Tool sharing a name with an MCPServer in the same namespace would otherwise reuse that server's session. Inline adapters set a UID-qualified `ServerName`. The stored Tool remains `type: inline` with no `spec.mcp` mutation.
- **Authentication:** inline connections have no OAuth/token Secret in v1. Existing HTTP/MCP credential behavior stays unchanged; referencing `mcp-auth-token-injection` does not authenticate the new endpoint. Restrict activator ingress to administrator-selected executor workloads and backend ingress to the activator. Do not publish an Ingress, gateway route, or external Service for either endpoint.

### Serve discovery without activation

The activator terminates stateless MCP Streamable HTTP using the installed Go MCP SDK (`Stateless` and JSON responses), with a distinct per-tool route. It handles initialization, initialized notifications, ping, and `tools/list` from Tool metadata. These operations neither create a runner nor extend its idle lifetime. Unsupported methods and unknown tool names fail without activation.

Only a valid `tools/call` activates the backend, after checking feature enablement, a usable published endpoint, the current Tool UID/generation, and child ownership. The activator establishes a backend MCP connection after readiness; it does not forward a client initialization request to a zero-pod Service. Do not accept arbitrary backend URLs, Deployment names, or script source in requests.

Package the activator as a separate singleton Deployment alongside the operator so process-local call tracking does not depend on controller HA. It uses `strategy: Recreate`: at one replica the default rolling update must surge, since `maxUnavailable: 25%` rounds down to zero, so two activators would briefly run and the new one's idle sweep could scale a runner to zero under a call the old one is still forwarding. Recreate trades a brief upgrade outage — already an accepted risk — for a single scaling authority with no extra machinery. Moving per-runner activity out of process, onto the runner Deployment, is the deferred path that would remove the singleton constraint altogether. It runs under its own ServiceAccount, granted the same way the controller's namespaced rules are: a ClusterRole bound per namespace through RoleBindings honouring `controllerManager.watchNamespaces`, never a blanket ClusterRoleBinding. The controller chart emits those RoleBindings only when `controllerManager.watchNamespaces` is non-empty and otherwise binds cluster-wide, so enabling inline tools requires a non-empty `controllerManager.watchNamespaces`. Its write access is the Deployment `scale` subresource on runners it owns, plus reads of Tools and runner Services and Endpoints; it needs no Secret access and no write access to Tool specs. Only the activator changes active/idle replica counts after initial creation. Coalesce concurrent cold starts, track pending and active calls, and scale down 60 seconds after the last call completes when no calls remain. Ordinary Tool reconciliation must not reset an active Deployment to zero.

Bound activation to 60 seconds and execution to 30 seconds, each shortened by the caller's remaining deadline. Connection/handshake timeout is separate from the complete tool-call budget. Cancellation terminates backend work; a restart or uncertain response is reported as failure, not an automatic replay of the script. After restart, reconcile existing runners conservatively before idle scale-down. Multi-replica activator coordination is deferred.

### Reconcile owned children and current revisions

Each Tool owns one ConfigMap, ServiceAccount, NetworkPolicy, Deployment, and Service in its namespace. Use UID-based labels and deterministic length-safe child names; `<tool>-source` is the source ConfigMap naming pattern for names that fit. Do not adopt or overwrite unrelated resources on a name collision. Delete cascades must work with both storage backends.

Keep the ConfigMap name stable and update its contents in place. Put the source checksum in `ark.mckinsey.com/inline-source-hash` on the pod template, and roll the template for language and other runner configuration changes. Mount a per-pod source snapshot read-only using `subPath`; verify its checksum before readiness so a ConfigMap/template update race cannot execute a mismatched revision. Use a language-appropriate filename (`source.sh`, `source.py`, `source.js`, `source.ts`) under `/tool`, all sourced from ConfigMap key `source`.

Before admitting new calls, the activator checks that the backend serves the current revision. Calls already running during an edit may complete or fail during rollout, but must not be replayed. Reconcile source edits and child drift even when the Tool is already available. Available means the endpoint and current configuration are usable, not that a pod is warm. Since `resolvedAddress` points at the activator, an unavailable activator Deployment makes the endpoint unusable: `Available=False` with reason `ActivatorUnavailable`, the way the MCPServer controller reports its own dependency. Missing runner components and a conflicting NetworkPolicy likewise set `Available=False` with their own reasons, and provisioning errors surface as `ProvisioningFailed`.

Disable blocks new invocations, clears usable endpoints, and scales runners down after bounded in-flight work. Two things make that reachable rather than aspirational. The `inlineTools.enabled` toggle governs authoring and invocation only: it does not uninstall the activator or stop Tool reconciliation, because only the activator changes replicas while the feature is enabled, and removing it would leave running pods with nothing authorised to scale them down. And during disable the controller owns the scale-down after a bounded drain — there are no new calls to race, so the single-authority invariant applies while enabled, not while draining. Uninstalling the components is a later step, valid once no inline Tools remain. Delete invalidates cached routes/waiters and removes owned objects. Status updates and cleanup must remain possible while the feature is disabled.

### Use bounded JSON arguments and UTF-8 results

The common static Go runner invokes a fixed interpreter executable with a script path followed by one serialized JSON argument. Never use shell command interpolation, `eval`, or language selection from a shebang. Python reads `sys.argv[1]`, bash reads `$1`, and Node/TypeScript read `process.argv[2]`.

| Limit | v1 contract |
| --- | --- |
| Source | 64 KiB of UTF-8 bytes |
| MCP request body | 128 KiB, rejected before unbounded decoding |
| Serialized arguments | JSON object, at most 64 KiB of UTF-8 bytes; rejected before spawning |
| stdout | At most 256 KiB returned as MCP text, including any truncation indicator |
| stderr | Last 4 KiB in an error; bounded capture/logging |
| Execution | 30 seconds or remaining caller budget, whichever is shorter |
| Runner resources | Requests 50m CPU / 64Mi; limits 500m CPU / 256Mi |

Set requests explicitly and below the limits. Omitting them makes Kubernetes default requests to limits, so every cold start would reserve 500m CPU and 256Mi — enough to leave activation waiting on scheduling, or failing its 60-second deadline, on the small clusters this feature targets.

Drain stdout/stderr incrementally with bounded memory; do not capture unlimited output and truncate afterward. Return one result after execution, not a streamed tool response. Successful stdout must be valid UTF-8; truncate on a character boundary and indicate truncation. Binary/invalid UTF-8 stdout is a tool error. Render invalid stderr bytes safely within the error bound.

Non-zero exit, timeout, cancellation, and invalid output return MCP `isError` results with bounded messages. Preserve this signal through shared MCP result handling instead of introducing an inline-specific execution path. Kill and reap the subprocess group on timeout/cancellation and clean up remaining children on completion, including children holding pipes open. The timeout and process cleanup are not hostile-author isolation guarantees.

### Publish per-language images

Share one `CGO_ENABLED=0` Go runner build. The bash image includes bash, jq, and coreutils on Alpine; Python uses a distroless Python base; Node and TypeScript use distroless Node, with the TypeScript image vendoring its loader at build time. Invoke the loader through Node rather than relying on a shell launcher. Pin bases and publish signed images through existing build tooling.

Scripts have only the documented standard libraries/tools. Import scanning is not admission policy: missing third-party packages fail at execution and indicate that the author needs an MCPServer. Smoke-test all four images under the real security settings, including TypeScript syntax and read-only source paths. Allow only a bounded ephemeral scratch volume if required by a runtime; it supplies no caller reference files and is not durable tool state.

### Enforce author admission on both storage backends

Keep `inlineTools.enabled` false by default. For inline creation and every inline spec update (including PATCH/apply), require an explicit successful SubjectAccessReview with `group: ark.mckinsey.com`, `resource: inlinetools`, `verb: use`, and the server-validated Tool namespace. Forward the authenticated subject's username, UID, groups, and extra information where present. Missing identity, denial, timeout, or authorization failure rejects the write. RBAC bindings are explicit administrator actions; existing Tool editor and ark-api roles gain no automatic grant.

- **CRD/etcd:** obtain identity from AdmissionReview. Add a mandatory fail-closed inline security admission path that cannot be skipped by `ark.mckinsey.com/skip-webhook-validation`, configurable Ignore behavior, or namespace selectors that leave inline writes unchecked. Structural validation remains shared. If security admission cannot be installed, the schema/admission configuration must reject inline, not leave it usable.
- **PostgreSQL:** enforce the same decision in `ark/internal/apiserver/admission.go` using authenticated request-context identity. The host API server does not run the CRD webhook chain for aggregated resources. The check must not depend on optional third-party webhook or CEL policy configuration, and inline writes are rejected if API-server authentication is disabled.
- **API/dashboard:** inline create/spec-update paths require authenticated end-user impersonation; reject disabled impersonation, missing identity, and API-key-only calls. Never retry as ark-api's service account, even when general fallback is enabled. Apply this to typed `/tools` and generic resource writes, examining the stored object on updates as well as the submitted one. Direct Kubernetes callers, including explicitly granted service accounts, use normal authenticated admission.
- **Authorship record:** on every accepted inline write, the same admission path stamps the authenticated subject and timestamp onto the Tool as `ark.mckinsey.com/inline-authored-by` and `ark.mckinsey.com/inline-authored-at`, the way the mutating webhooks already stamp `annotations.MigrationWarningPrefix`, and the controller emits an event through the existing eventing provider when the source hash changes. Authors cannot set or alter these annotations themselves; a write that tries is overwritten with the admitted identity. Audit logs stay the primary trail but cannot be the only one — `ARK_APISERVER_AUDIT_ENABLED` can be off on the PostgreSQL backend, which only logs a warning.
- **Cleanup:** unchanged-spec metadata operations, the status subresource, and deletion use their ordinary permissions, not the author permission. Disabling inline prevents new authoring but must not strand finalizers or deletion. No metadata update may change the executable spec as a side effect.

### Own the runner NetworkPolicy; treat enforcement as a cluster prerequisite

Ark owns one NetworkPolicy per runner: deny egress, and restrict backend ingress to the activator. That object is Ark's to create and keep correct, so it is in scope.

A deny-all policy is not sufficient by itself, because policies are additive. The tenant chart's optional policy selects every pod (`podSelector: {}`) and allows all egress, and its ingress rule admits every pod in the namespace — so enabling it defeats both halves of the runner policy. The controller reads the policies selecting the runner's labels in its namespace and refuses to publish a usable endpoint while one of them widens egress or backend ingress, reporting the conflicting policy by name. This is API reads and an honest status, not traffic testing, and Ark never rewrites a policy it does not own.

Whether the CNI enforces NetworkPolicy at all is a cluster property, like the PID limits above: Ark cannot configure it and does not test it at runtime. No live probe, positive control, or synthetic connection gates execution. Document it as a deployment prerequisite, name the symptom of getting it wrong, and prove the boundary where it can actually be proven — the Chainsaw negative-egress check on an enforcing CNI in task 7.2.

This establishes the documented NetworkPolicy boundary, not absolute network isolation. Standard NetworkPolicy has limits, including node-local traffic exceptions; cluster administrators remain responsible for CNI enforcement, node/metadata-service protection, and trusted policy administration. Document those limitations rather than promising an air gap. There is no author-facing egress relaxation in v1.

### Keep PID containment an administrator best practice

A script can exhaust node-level PIDs and disrupt other workloads before the execution timeout. CPU/memory limits do not guarantee protection. Administrators should configure finite per-pod limits through kubelet `podPidsLimit` or their provider/runtime equivalent, size them for processes and threads on affected nodes, and verify enforcement outside production.

This is outside Ark configuration: [AKS exposes `podMaxPids`](https://learn.microsoft.com/en-us/azure/aks/custom-node-configuration-reference); [EKS AL2023 nodeadm accepts kubelet configuration](https://awslabs.github.io/amazon-eks-ami/nodeadm/doc/api/#kubeletoptions). Supported controls vary by provider and node type; consult the provider where they are not exposed. See [Kubernetes PID limits and reservations](https://kubernetes.io/docs/concepts/policy/pid-limiting/).

Ark does not prescribe 128, modify node configuration, require a dedicated node pool, or gate admission/readiness/execution on PID verification. This does not bypass existing cluster limits. Surface the residual risk and recommendation in operations documentation.

### Deliver dashboard authoring first

Use the current `components/forms/tool-form/` and `lib/services/tools.ts`, not the historical mockup's removed editor/row paths. Add Inline to the existing Add Tool flow, a required language selector without a default, and a required monospace source textarea. Validate the UTF-8 byte limit without trimming the stored source. No Monaco/CodeMirror dependency.

Update handwritten API request models and dashboard serialization as well as generated SDK types. `ToolSpec` omits `mcp` and `builtin`, and `update_tool` assigns `spec` wholesale from it, so a typed PUT already drops those blocks from an existing Tool. Fix that whitelist alongside adding `inline`, rather than adding a fourth subtype to a broken list. Support create, detail read, and persisted source/language edits through PUT. Add language to the list projection for the badge without returning every script body. Read the `Available` condition by walking `status.conditions` the way `a2a-servers.ts` already walks its own, then branch on the condition's `reason`, which is new behaviour for the dashboard, so a policy conflict for an administrator reads differently from a runtime the platform team has not installed. Display admission errors; authorization remains server-side.

Phase 1 ships the authoring path, mandatory author admission on both backends, and an honest Pending status with a not-yet-executable hint. It provisions no runner and advertises no usable execution endpoint. Phase 2 supplies runner images and reconciliation; Phase 3 supplies runner policies with conflict detection, activation, and resolution adapters. Enable execution only when that full path is available. The task groups follow this sequence.

## Risks / Trade-offs

- **PID exhaustion and kernel escape:** residual platform risks, not solved by separate pods or a timeout. Document administrator hardening; no unverified containment claim.
- **CNI enforcement and endpoint reachability:** the runner policy is inert on a non-enforcing CNI, and network policies do not add per-user authorization. Administrators must restrict ingress and protect policy/label management; approved executors remain trusted.
- **Cold starts and object count:** unused runners cost no pods, but every Tool still has Kubernetes objects and an activator dependency. KeepWarm and pooling are deferred.
- **Singleton activator:** temporary unavailability interrupts tool calls; v1 favors a single scaling authority over distributed call tracking. Do not replay uncertain calls.
- **Script edits:** a rollout can interrupt in-flight work; revision checks prevent new calls from silently using stale source.
- **Resource budgets and packaging:** prove the four images work within the fixed budgets and security settings; do not relax them silently to make a smoke test pass.

## Migration Plan

Existing Tool types and their reconciliation behavior remain unchanged. New enum/status fields and the disabled-by-default feature are additive. No data migration is needed.

Deliver authoring first as described above. Before enabling execution, publish runner images, install runtime components and resolution adapters, and confirm the CNI enforces NetworkPolicy. Authorized Tools may exist in Pending while these prerequisites are incomplete.

For downgrade, first disable new invocations, delete inline Tools, and verify their owned resources and runner pods are gone while the inline-aware controller is still installed. Only then revert the operator or remove the enum. Reverting the operator alone does not stop surviving Deployments or make them inert.

## Deferred Decisions

KeepWarm, configurable resource/time limits, multi-replica activation, richer editors, and CLI shortcuts are follow-ups, not v1 blockers. There is no synthetic MCPServer visibility decision: v1 creates none. PID enforcement and a new per-user invocation permission are explicitly outside this change.
