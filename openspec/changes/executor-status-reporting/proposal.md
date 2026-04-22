## Why

When executors with scheduling capabilities (e.g., Claude Agent SDK) receive a query, session infrastructure (pods, filesystems) can take ~30 seconds to provision. During this time users see "Running" with no indication that they're waiting for infrastructure, not intelligence. This erodes trust and makes the system feel broken.

## What Changes

- The A2A Query Extension (`query/v1`) gains a new metadata key (`/status`) for executors to report their state back to the operator
- The operator switches from `blocking: true` to `blocking: false` A2A dispatch, then polls `GetTask` until completion — writing executor status to the Query CR on each poll
- The Query CRD gains an `executorStatus` field (state + message) on `QueryStatus`
- The Ark SDK defines a standardized `ExecutorState` enum and `report_status()` method on `BaseExecutor`
- All four surfaces (dashboard, Ark CLI, Fark CLI, REST API) read `executorStatus` and display contextual status within the "running" phase

## Capabilities

### New Capabilities
- `executor-status-reporting`: Executors report provisioning/execution state via A2A Query Extension; operator relays to Query CR; surfaces display contextual status to users

### Modified Capabilities
- `query-extension-v1`: Extended with a `/status` metadata key for executor → operator status flow (existing `/ref` key unchanged)

## Impact

- `ark/api/extensions/query/v1/` — New status schema, updated README documenting bidirectional flow
- `ark/api/v1alpha1/query_types.go` — `ExecutorStatus` struct added to `QueryStatus`
- `ark/internal/a2a/a2a.go` — New `QueryExtensionStatusKey` constant, status extraction from Task metadata
- `ark/internal/controller/query_controller.go` — Switch to non-blocking A2A dispatch + `GetTask` poll loop, write `executorStatus` on each poll
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor.py` — `ExecutorState` enum, `report_status()` on `BaseExecutor`
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor_app.py` — Wire `report_status()` into A2A Task status metadata
- `services/ark-dashboard/` — Contextual status subtitle under phase badge
- `services/ark-api/` — Expose `executorStatus` in query response payloads
- `tools/ark-cli/` — Show executor status in polling/streaming output
- `tools/fark/` — Show executor status in query watcher spinner

### Documentation
- `docs/content/reference/resources/query.mdx` — New `executorStatus` field
- `docs/content/reference/query-execution.mdx` — Updated lifecycle with intermediate status and polling
- `docs/content/developer-guide/building-execution-engines.mdx` — `report_status()` contract for executor implementers
- `ark/api/extensions/query/v1/README.md` — Bidirectional flow, status metadata key, status schema
- `docs/content/developer-guide/queries/a2a-queries.mdx` — A2A queries now carry intermediate status
- `docs/content/developer-guide/cli-tools.mdx` — Fark executor status display
- `docs/content/user-guide/dashboard.mdx` — Dashboard provisioning indicator

### Downstream (separate proposal in marketplace repo)
- `executors/claude-agent-sdk/` — First executor to implement `report_status(INITIALIZING, "Initializing session")` during scheduler pod provisioning
- `agents-at-scale-marketplace/docs/content/executors/claude-agent-sdk.mdx` — Document status reporting behavior
