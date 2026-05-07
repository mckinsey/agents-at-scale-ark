## Why

When executors with scheduling capabilities provision infrastructure on demand, users see a query stuck at "running" with no indication that a pod is being created. The gap between dispatch and actual execution can be 10-60 seconds. Users interacting through the dashboard, CLI, or API cannot distinguish "the executor is thinking" from "we're still spinning up infrastructure." The executor is the component that knows about provisioning. It needs a way to signal this state back to the Query, and the interfaces need to display it.

## What Changes

- Add `provisioning` as a new Query phase between `pending` and `running` in the Query CRD phase enum. No new fields — uses existing Condition with new reason `ExecutorProvisioning` and freeform message.
- Add a `QueryStatusUpdater` utility to `ark-sdk` that lets executors optionally patch Query status via K8s API. Injected alongside `broker_client` in executor context by `A2AExecutorAdapter`. Uses query ref already in A2A message metadata. Best-effort: missing ref or API failures log and no-op.
- Update dashboard StatusDot component to show amber/yellow dot for provisioning phase, display condition message as supplementary text.
- Update fark CLI QueryWatcher to handle provisioning phase with specific spinner text, display condition message.
- No changes to query controller dispatch logic or A2A protocol. Controller sets "running" at dispatch as today; the executor briefly overrides to "provisioning" then back to "running."

## Capabilities

### New Capabilities

- `executor-query-status-update`: SDK utility enabling executors to optionally update Query phase and condition during execution. Generic — any executor can use it, none are required to.

### Modified Capabilities

- `query-provisioning-phase`: Query CRD phase enum gains `provisioning`. Existing "Completed" condition gains reason `ExecutorProvisioning`.
- `provisioning-status-display`: Dashboard shows amber/yellow dot for provisioning. Fark CLI shows provisioning spinner text. Both surface condition message.

## Impact

- **Query CRD** (`ark/api/v1alpha1/query_types.go`): Phase enum adds `provisioning`. CRD manifests regenerated.
- **ark-sdk** (`lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/`): New `QueryStatusUpdater` class injected by `A2AExecutorAdapter`.
- **Dashboard** (`services/ark-dashboard/`): StatusDot component gains provisioning case.
- **Fark CLI** (`tools/fark/`): QueryWatcher gains provisioning phase handling.
- **Controller**: No changes.
- **A2A protocol**: No changes.
- **Cross-repo**: Companion proposal in `agents-at-scale-marketplace` (`openspec/changes/query-provisioning-status/`) covers Claude Agent SDK scheduler integration and executor RBAC.
