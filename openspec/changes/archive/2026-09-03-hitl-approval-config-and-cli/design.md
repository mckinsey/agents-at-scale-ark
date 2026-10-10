## Context

See proposal.md — Why. The `hitl-tool-approval` capability already ships the backend schema (`AgentTool.approval` with `required`/`timeout`/`onTimeout`), the executor pause/resume flow, the approval endpoint, and a dashboard approve/reject UI. This change adds two thin surfaces on top; the notable constraints are:

- The Go CRD `AgentTool` (`ark/api/v1alpha1/agent_types.go`) carries `Approval *ToolApprovalConfig`, but the dashboard's generated `AgentTool` type (`services/ark-dashboard/.../lib/api/generated/types.ts:2804-2810`) has only `name`/`type`/`labelSelector` — **no `approval` field**. The field is not yet flowing through the type pipeline (CRD → OpenAPI → ark-api models → dashboard `types.ts`).
- ark-api lists A2ATasks at `GET /a2a-tasks` (`services/ark-api/.../api/v1/a2a_tasks.py:147`) with **no phase filter**. The list response exposes `status.phase` and `status.protocolMetadata`.
- The approval endpoint is `POST /a2a-tasks/{task_name}/approval` with body `{ "decision": "approved" | "rejected" }` (`a2a_tasks.py:208`), and requires the task to be in `input-required` phase (409 otherwise).
- ark-cli uses `commander` with a factory-per-command-group pattern and an `ArkApiClient` HTTP wrapper (`tools/ark-cli/src/lib/arkApiClient.ts`).
- The dashboard already parses pending-approval details (tool calls, timeout, expiry, agent) from `status.protocolMetadata` in `lib/services/a2a-task-approvals.ts` (`buildApprovalDetails`).

## Goals / Non-Goals

**Goals:**
- Configure `AgentTool.approval` from the dashboard agent editor using the existing agent update path.
- List and respond to pending approvals from the ark CLI using the existing approval endpoint.
- Reuse existing schemas, endpoints, and parsing logic — no new CRD fields, no new API behavior.

**Non-Goals:**
- No server-side phase filter on the task-list endpoint (client-side filter for now).
- No changes to the approval decision model, executor, or controller.
- No CLI interactive/streaming "wait for approval" mode — approve/reject/list only.
- No role-based approver authorization (tracked separately as future HITL work).

## Decisions

### 1. Dashboard writes `approval` through the existing agent update path
The editor adds per-tool approval controls whose values ride inside each `AgentTool` in the `tools[]` array already sent by `agentsService.update()` / `create()`. No new endpoint or service call.

- **Why:** approval is intrinsic to the agent's tool binding; the update path already serializes `tools[]`.
- **Alternative rejected:** a dedicated approval-config endpoint — unnecessary indirection when `tools[]` already round-trips.

### 2. Regenerate types so `approval` reaches the dashboard, rather than hand-patching
The `approval` field must appear on `AgentTool` in ark-api's model and the dashboard's generated `types.ts`. Follow the standard pipeline (per the `ark-sdk-development` skill): ensure the CRD OpenAPI schema includes `approval`, regenerate the ark-api models, then regenerate the dashboard `types.ts`.

- **Why:** `types.ts` is generated; hand-editing it drifts from the source of truth and is overwritten on the next regen.
- **Alternative rejected:** a local override type for `AgentTool` — creates a second definition that silently diverges.
- **Consequence:** this is the first task and gates the editor UI. It is a code change in ark-api (regenerated models), even though no API *behavior* changes — a refinement of the proposal's "no change expected" note for the API.

### 3. CLI lists pending approvals by client-side filtering `input-required` tasks
`ark approvals list` calls the existing `GET /a2a-tasks` (paginated via the client's `fetchAllPages`) and filters to `status.phase === "input-required"`.

- **Why:** avoids a backend change; task volume awaiting human approval is small by nature.
- **Alternative rejected:** add a `?phase=` query param to ark-api — more surface area for marginal benefit at current scale; can be added later without changing the CLI contract.

### 4. CLI reuses the approval endpoint via `ArkApiClient`
Add `listA2ATasks()` and `submitApproval(taskName, namespace, decision)` to `ArkApiClient`, and a `createApprovalsCommand(config)` factory registered in `index.tsx`, exposing `approvals list`, `approvals approve <task>`, `approvals reject <task>`.

- **Why:** matches the existing commander/client conventions (`queries`, `tools` command groups).

### 5. Reuse the dashboard's approval-detail parsing shape for CLI display
CLI list output derives tool calls, agent name, timeout, and expiry from `status.protocolMetadata`, mirroring `buildApprovalDetails` so both surfaces interpret the same fields identically.

- **Why:** one interpretation of `protocolMetadata` prevents the two clients from disagreeing about what a pending approval shows.

## Risks / Trade-offs

- **Generated types missing `approval` block the editor** → Order tasks so type regeneration lands and is verified before the editor UI; if the CRD OpenAPI schema itself omits `approval`, fix that at the source before regenerating downstream.
- **Client-side phase filtering doesn't scale** with very large task counts → Acceptable now (pending approvals are few, listing is paginated); documented as a future server-side filter, reversible without changing the CLI contract.
- **`protocolMetadata` is a string map** with JSON-encoded values (tool calls) → Parse defensively and reuse the dashboard's existing parsing so malformed/absent fields degrade to a readable row rather than crashing.
- **CLI auth/impersonation parity** — the dashboard passes impersonation config to the approval endpoint; the CLI must send whatever auth the `ArkApiClient` already uses for other mutating calls → Follow the existing client's auth handling; no new auth mechanism.

## Migration Plan

Purely additive across dashboard and CLI. No CRD or stored-data changes, so no data migration. Rollback = revert the dashboard editor fields and remove the CLI command group; existing YAML-configured approvals and the dashboard approve/reject UI are unaffected either way. Ship type regeneration first, then the two surfaces independently.
