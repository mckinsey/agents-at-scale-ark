## Why

The `hitl-tool-approval` capability added per-tool approval to Ark: the backend `AgentTool.approval` config, the executor pause/resume flow, the approval API, and a dashboard UI to approve/reject pending calls. Two interaction gaps remain:

- **Configuration is YAML-only.** The dashboard agent editor cannot set `approval.required`, `approval.timeout`, or `approval.onTimeout` on a tool. Users must hand-edit YAML or `kubectl` to decide which tools require approval — the one part of the workflow the dashboard does not cover.
- **Approval is dashboard-only.** The ark CLI has no way to list or respond to pending approvals. Terminal-based and scripted workflows must call the raw API (`POST /v1/a2a-tasks/{name}/approval`) directly.

Both gaps force users out of the tools they already use to configure and operate HITL.

## What Changes

- Add approval configuration to the dashboard agent editor: for each attached tool, expose `required` (toggle), `timeout` (duration), and `onTimeout` (`reject` | `proceed`), persisted to the Agent's `AgentTool.approval` block.
- Add an ark CLI command group to list pending tool approvals and approve/reject them:
  - List queries/tasks currently in `input-required` awaiting approval, showing the agent, tool calls, and expiry.
  - Approve or reject a pending approval by task name, calling the existing approval endpoint.
- No CRD or backend behavior changes — both surfaces reuse the existing `AgentTool.approval` schema and `POST /v1/a2a-tasks/{name}/approval` endpoint.

## Capabilities

### New Capabilities
- `hitl-approval-dashboard-config`: Dashboard agent editor configures per-tool approval requirements (`required`, `timeout`, `onTimeout`), reading and writing the existing `AgentTool.approval` block.
- `hitl-approval-cli`: ark CLI lists pending tool approvals and submits approve/reject decisions.

### Modified Capabilities
<!-- None. Both surfaces reuse the existing hitl-tool-approval schema and approval API without changing their requirements. -->

## Impact

- **Dashboard (TypeScript)**: `services/ark-dashboard` agent editor gains approval fields per tool; agent create/update payloads carry `approval` on tools. No new API — writes go through existing agent update path.
- **ark CLI (Node.js)**: `tools/ark-cli` gains an approvals command group; adds an API client call to list `input-required` tasks and `POST /v1/a2a-tasks/{name}/approval`.
- **API (Python)**: No change expected; reuses existing `submit_a2a_task_approval` endpoint and A2ATask listing. Confirm a list/filter path for pending approvals exists or add a thin query.
- **CRD / Go operator**: None.
- **Tests**: Dashboard component/e2e tests for the approval editor; ark-cli unit tests for the approvals command.
- **Dependencies**: None new.
