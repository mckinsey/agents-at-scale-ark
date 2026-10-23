# Inline Tools release gate (task 7.6)

The gate that must hold before an operator enables execution. Execution ships
disabled by default — `inlineTools.enabled: false` in
`ark/dist/chart/values.yaml` and `ark/dist/chart-apiserver/values.yaml` — and
no unit in this change flips that default; enabling it stays a per-install
administrator opt-in.

## Gates per touched stack

| Stack | Gate | Enforced by | Local run |
| --- | --- | --- | --- |
| `ark/` (Go) | `gofumpt`, `go vet`, unit + envtest | CI `build-and-test-ark` | gofumpt clean; `go vet` clean; `internal/inlinetools/...` pass; `internal/controller/...` + `internal/webhook/v1` envtest pass |
| `ark/` runner images | image smoke test | manual (`make smoke-inline-runners`, not run by CI) | all runners pass (see note) |
| `lib/ark-sdk/` (Python) | pytest | CI `build-libs` | per-PR in CI |
| `services/ark-api/` (Python) | pytest | CI `build-and-test-services` | per-PR in CI |
| `services/ark-dashboard/` (TS) | vitest | CI `build-and-test-services` | per-PR in CI |
| `tests/` (Chainsaw) | e2e | CI `e2e-tests-inline` (etcd + postgresql) | full `inline-tools` suite green on an enforcing CNI, both backends |

`golangci-lint` in `ark/` fails on a Go-version mismatch unrelated to this
change; `gofumpt` + `go vet` are the local gate and `golangci-lint` still runs
in CI. `pyright` (`lib/ark-sdk/`, `services/ark-api/`) and `eslint`/`tsc`
(`services/ark-dashboard/`) are `make lint` targets that CI does not run —
`build-libs` and `build-and-test-services` run tests only. Run `make lint` in
each directory manually until that gap is closed.

## Image smoke tests

`make smoke-inline-runners` is a manual check, not run by CI. It runs a real
script through each runner image (bash, python, node, ts on the node image)
under the controller's pod settings: non-root, read-only root filesystem,
dropped capabilities, no network, bounded CPU/memory. All pass locally.

- Note: the script bind-mounts a temp dir into the container. On Colima the
  daemon runs in a VM, so the temp dir must be under a VM-mounted path
  (`TMPDIR=$HOME/tmp make smoke-inline-runners`); the default macOS `$TMPDIR`
  is not shared and the mount reads empty. This is a local-runner caveat, not a
  runner defect — the images execute real scripts through the activator in the
  e2e suite.

## End-to-end checks (task 7.2)

Chainsaw suite, label `inline-tools`, run by `e2e-tests-inline` over both
storage backends on a Calico-enforcing cluster. Verified locally on
etcd and, after a postgresql redeploy, on the aggregated apiserver:

- `inline-tool-lifecycle` — create, child provisioning (Deployment, Service,
  ConfigMap, ServiceAccount, NetworkPolicy), a cold runner at zero replicas,
  call, idle scale-down back to zero after that call, edit propagation to the
  source ConfigMap, cascade delete of every child.
- `inline-tool-egress` — runner egress to an internal endpoint is denied.
- `inline-tool-admission` — unauthorized authoring denied, authorized accepted,
  authorship stamped over any requester-supplied value; same on both backends.
- `inline-tool-conflicting-policy` — a tool blocked by a conflicting
  NetworkPolicy stays Pending and is never shown as Ready, then recovers.

Not covered end to end: the dashboard-first Pending state (a tool authored
before the runtime is installed, `RuntimeNotInstalled`) and agent-attached
invocation. The lifecycle suite's attach step proves only that an Agent
referencing the tool with `type: inline` reaches `Available`, which
`AgentReconciler.checkToolDependencies` grants once the Tool CR exists with a
matching `spec.type` — it reads neither the Tool's `Available` condition nor
its `resolvedAddress`. The call is a `target.type: tool` query, so agent-side
tool resolution and LLM-side tool discovery are unverified; that path is task
6.4, which is still open.

**Execution should not be enabled until 6.4 and the dashboard-first e2e case
land.** Both tasks are currently unchecked in `tasks.md`, so 7.6 stays open
too.

## Remaining platform limitations (before enabling execution)

Documented for operators (see `docs/content/**` and design.md); not Ark-managed
and not gated at runtime:

- **CNI enforcement is a cluster prerequisite.** The runner NetworkPolicy is
  inert on a non-enforcing CNI (e.g. k3s flannel); egress denial holds only
  where the CNI enforces NetworkPolicy (e.g. Calico). Ark sends no probe and
  does not gate execution on enforcement.
- **NetworkPolicy is not an air gap.** Standard NetworkPolicy has node-local
  traffic exceptions and does not add per-user authorization; administrators
  remain responsible for node/metadata-service protection and trusted policy
  and label administration.
- **PID exhaustion is a residual node risk.** A script can exhaust node PIDs
  before the timeout. Administrators should set finite per-pod PID limits
  (`podPidsLimit` or the provider equivalent) and verify them; Ark adds no PID
  setting, node-pool requirement, or PID-based gate.
- **Approved executors remain trusted.** Non-root, dropped capabilities,
  bounded resources, and timeouts reduce but do not guarantee containment of a
  malicious authorized author or a kernel escape.
- **A timed-out tool call fails the whole Query, not just the tool.** The 30s
  execution timeout surfaces as a Go error from the MCP executor
  (`ark/executors/completions/mcp.go`), which `Agent.executeToolCalls` treats
  as fatal instead of feeding a tool-error message back to the model — unlike
  an ordinary tool error, which the model sees and can recover from.
- **`inline-tool-author-role` is a `ClusterRole`.** Nothing binds it by
  default, and per-namespace scoping via a `RoleBinding` is the documented
  pattern, but it can be granted cluster-wide with a `ClusterRoleBinding`.
- **`InlineSourceChanged` fires on any spec edit, not just a source change.**
  Phase 1 has no runner to carry a reconciled revision to compare against, so
  the event is keyed on `metadata.generation`
  (`ark/internal/controller/tool_controller.go`) and also fires for edits that
  do not touch `spec.inline.source`.
- **An empty `spec.inline` isn't rejected; it ends up `ProvisioningFailed`.**
  The admission webhook rejects a nil or empty inline spec, but the webhook
  can be skipped (per-namespace skip labels, or `inlineTools.enabled: false`
  fail-open settings), and `spec.inline` is optional in the CRD schema itself.
  A Tool that reaches reconciliation without one reports `ProvisioningFailed`
  rather than crashing.
- **Fixed limits**: 30s execution timeout, 60s activation timeout, 60s idle
  scale-down, 4 KiB stderr, 256 KiB stdout, 64 KiB arguments
  (`ark/internal/inlinetools/runner/limits.go`,
  `ark/internal/inlinetools/activator/lifecycle.go`). See
  `openspec/changes/inline-tools/specs/inline-tools/spec.md` for the full
  reference.
