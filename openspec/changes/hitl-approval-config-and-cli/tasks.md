## 1. Type pipeline: surface `approval` on AgentTool (gating)

- [ ] 1.1 Confirm the CRD OpenAPI schema for `AgentTool` includes the `approval` block (`required`, `timeout`, `onTimeout`); if missing, fix at the source in `ark/api/v1alpha1/agent_types.go` + regenerate manifests
- [ ] 1.2 Regenerate ark-api models so `AgentTool.approval` and `ToolApprovalConfig` appear in the Python models
- [ ] 1.3 Regenerate the dashboard generated types (`services/ark-dashboard/.../lib/api/generated/types.ts`) so `AgentTool` includes `approval`
- [ ] 1.4 Verify `AgentUpdateRequest`/`AgentCreateRequest` round-trip the `approval` field end to end (create/update an agent via API and read it back)

## 2. Dashboard: approval configuration in agent editor

- [ ] 2.1 Extend the editor's per-tool form state to hold `approval.required`, `approval.timeout`, `approval.onTimeout`
- [ ] 2.2 Render an approval control per attached tool: a required toggle, a timeout duration input, and an onTimeout select (`reject` | `proceed`)
- [ ] 2.3 Hide/disable timeout and onTimeout controls when approval is not required for that tool
- [ ] 2.4 Populate controls from the agent's existing `AgentTool.approval` when editing; default to not-required when absent
- [ ] 2.5 Include `approval` in each `AgentTool` in the `tools[]` payload sent by `agentsService.create()` / `update()`
- [ ] 2.6 Add component/unit tests: config renders, round-trips existing values, toggles gate timeout/onTimeout, and the save payload carries `approval` (per `services/ark-dashboard/CLAUDE.md` conventions)

## 3. ark CLI: approvals command group

- [ ] 3.1 Add `listA2ATasks()` to `ArkApiClient` (paginated via `fetchAllPages`), returning tasks with `status.phase` and `status.protocolMetadata`
- [ ] 3.2 Add `submitApproval(taskName, namespace, decision)` to `ArkApiClient` (`POST /a2a-tasks/{name}/approval`, body `{ decision }`), following existing auth handling
- [ ] 3.3 Add a shared helper to parse pending-approval details (agent, tool calls, timeout, expiry) from `protocolMetadata`, mirroring the dashboard's `buildApprovalDetails`
- [ ] 3.4 Create `createApprovalsCommand(config)` factory in `tools/ark-cli/src/commands/approvals/index.ts` and register it in `src/index.tsx`
- [ ] 3.5 Implement `approvals list`: fetch tasks, filter to `phase === input-required`, print task name, agent, tool call(s), and expiry; report "no pending approvals" when empty
- [ ] 3.6 Implement `approvals approve <task>`: submit `approved`; error non-zero if task not found or not in `input-required`
- [ ] 3.7 Implement `approvals reject <task>`: submit `rejected`; same error handling
- [ ] 3.8 Surface endpoint errors (not-found, 409 not-awaiting-approval, other) with a readable message and non-zero exit
- [ ] 3.9 Support `--namespace` and `--output <format>` consistent with existing command groups

## 4. CLI tests

- [ ] 4.1 Unit test `approvals list` for populated and empty cases (mocked client)
- [ ] 4.2 Unit test `approvals approve` / `reject` success and error paths (not found, not awaiting approval, endpoint error)
- [ ] 4.3 Unit test the `protocolMetadata` parsing helper against well-formed and malformed metadata

## 5. Verification and docs

- [ ] 5.1 Manual end-to-end: configure an approval-required tool in the dashboard editor, trigger a query, and approve/reject it from `ark approvals`
- [ ] 5.2 Update ark-cli help/README with the `approvals` command group
- [ ] 5.3 Note in HITL user docs that approval config is now editable in the dashboard and respondable from the CLI
- [ ] 5.4 Run lint + tests in each touched directory (`services/ark-dashboard`, `tools/ark-cli`, and ark-api if regenerated) per the pre-push gates
