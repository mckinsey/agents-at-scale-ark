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
| `ark/` runner images | image smoke test | `make smoke-inline-runners` | all runners pass (see note) |
| `lib/ark-sdk/` (Python) | pytest, pyright | CI `build-libs` | per-PR in CI |
| `services/ark-api/` (Python) | pytest, pyright | CI `build-and-test-services` | per-PR in CI |
| `services/ark-dashboard/` (TS) | jest, eslint, tsc | CI `build-and-test-services` | per-PR in CI (see note) |
| `tests/` (Chainsaw) | e2e | CI `e2e-tests-inline` (etcd + postgresql) | full `inline-tools` suite green on an enforcing CNI, both backends |

`golangci-lint` in `ark/` fails on a Go-version mismatch unrelated to this
change; `gofumpt` + `go vet` are the local gate and `golangci-lint` still runs
in CI.

## Image smoke tests

`make smoke-inline-runners` runs a real script through each runner image
(bash, python, node, ts on the node image) under the controller's pod settings:
non-root, read-only root filesystem, dropped capabilities, no network, bounded
CPU/memory. All pass.

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
- `inline-tool-pending` — an unusable authored tool stays Pending and is never
  shown as Ready, then recovers.

Not covered end to end: agent-attached invocation. The lifecycle suite's attach
step proves only that an Agent referencing the tool with `type: inline` reaches
`Available`, which `AgentReconciler.checkToolDependencies` grants once the Tool
CR exists with a matching `spec.type` — it reads neither the Tool's `Available`
condition nor its `resolvedAddress`. The call is a `target.type: tool` query, so
agent-side tool resolution and LLM-side tool discovery are unverified.

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
