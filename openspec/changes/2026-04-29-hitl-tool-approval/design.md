## Context

The agent execution loop in `ark/executors/completions/agent.go` (lines 181-208) runs a tight loop: model completion returns tool calls, `executeToolCalls()` executes them immediately, results feed back to the model. No approval mechanism exists.

Existing infrastructure to leverage:
- **A2A protocol** has `input-required` and `auth-required` phases (used for external A2A task delegation)
- **Event streaming** via ark-broker delivers real-time chunks to clients
- **Tool annotations** (`DestructiveHint`, `ReadOnlyHint`) exist but are informational only
- **Query CRD** has phases `pending → running → error/done/canceled`

Industry patterns researched:
- **LangGraph**: Uses `interrupt()` function with checkpointer for state persistence; resumes via `Command(resume=value)`
- **Claude Code**: Permission rules (Allow/Ask/Deny) with auto-mode classifiers and hooks for programmatic control

## Goals / Non-Goals

**Goals:**
- Per-tool approval configuration: mark specific tools as requiring human approval before execution
- Query pause/resume: queries can enter an `approval-required` state and resume after approval
- Audit trail: record approval decisions for compliance
- Real-time UX: clients receive immediate notification when approval is needed
- Backwards compatibility: agents without HITL config continue executing tools immediately
- Cross-executor support: pattern works for both built-in completions executor and external execution engines

**Non-Goals:**
- Automated approval classifiers (like Claude Code's auto-mode) — can be added later
- Complex approval policies (multi-approver, escalation chains) — start with simple approve/reject
- Approval for model outputs (only tool calls) — model response approval is a separate concern
- Modification of tool call arguments during approval — approve/reject only, no edit

## Decisions

### 1. Approval configuration location: `AgentTool.approval` block

Add an `approval` block to `AgentTool` (in `agent_types.go`) rather than `ToolAnnotations` (in `tool_types.go`).

Rationale: Approval is an operational concern that varies per-agent, not an intrinsic property of the tool. The same MCP tool might require approval in a production agent but not in a development agent. Placing it on `AgentTool` allows per-agent configuration.

```yaml
spec:
  tools:
    - name: delete-record
      type: http
      approval:
        required: true
        timeout: 5m
        onTimeout: reject  # or "proceed"
```

**Alternative considered:** Add `requiresApproval` to `ToolAnnotations`. Rejected because it would apply globally to all agents using that tool.

### 2. State management: Hybrid CRD + Event approach

Use a ToolApprovalRequest CRD for persistence and audit trail, combined with event streaming for real-time UX.

**CRD layer (persistence):**
- Query enters `approval-required` phase when tool needs approval
- ToolApprovalRequest CRD created with pending tool call details
- Controller watches ToolApprovalRequest; when approved, signals executor to continue

**Event layer (real-time):**
- Executor emits `ToolApprovalRequest` event to broker immediately
- Connected clients receive notification without polling
- If client disconnects, CRD state persists for later action

**Alternative considered:** Pure event-based (no CRD). Rejected because state would be lost on system restart or client disconnect.

**Alternative considered:** Pure CRD-based (polling only). Rejected because polling adds latency; real-time UX is important for interactive workflows.

### 3. Query phase: Add `approval-required` to existing enum

Extend the Query status phase enum to include `approval-required`:
```
pending → running → approval-required → running → done
                                     ↘ error/canceled
```

The query remains in `approval-required` until approval is received or timeout occurs. This integrates naturally with existing phase-based state machine.

**Alternative considered:** Create separate `ToolApprovalRequest` CRD without Query phase change. Rejected because it fragments state; Query phase should reflect that execution is paused.

### 4. ToolApprovalRequest CRD structure

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: ToolApprovalRequest
metadata:
  name: query-abc123-tool-0
  namespace: default
  ownerReferences:
    - kind: Query
      name: query-abc123
spec:
  queryRef:
    name: query-abc123
    namespace: default
  toolCall:
    id: "call_xyz"
    name: "delete-record"
    type: "http"
    arguments: '{"recordId": "123"}'
  timeout: 5m
  onTimeout: reject
status:
  phase: pending  # pending, approved, rejected, expired
  decision:
    action: approved  # approved, rejected
    decidedBy: "user@example.com"
    decidedAt: "2026-04-29T10:30:00Z"
    reason: "Verified record can be deleted"
```

Owner reference ensures cleanup when Query is deleted.

### 5. Executor integration: Yield pattern

Modify `executeToolCalls()` in `agent.go` to check approval policy before each tool call:

```go
for _, tc := range toolCalls {
    if requiresApproval(tc) {
        // Create ToolApprovalRequest, emit event, return with pending status
        return newMessages, &ApprovalRequiredError{ToolCall: tc}
    }
    // Execute tool as normal
}
```

The executor returns an `ApprovalRequiredError` which signals the handler to:
1. Create ToolApprovalRequest CRD
2. Update Query phase to `approval-required`
3. Emit streaming event
4. Exit the current execution (state persisted)

When approval is received, the controller triggers re-execution with the saved state.

### 6. Resume mechanism: Re-dispatch with context

When ToolApprovalRequest is approved, the controller re-dispatches the query to the executor with:
- Original conversation history
- Pending tool calls marked as approved
- Continuation point (which tool call to resume from)

This follows LangGraph's pattern of resuming from checkpointed state.

### 7. Multiple tool calls: Batch approval by default

When the model returns multiple tool calls in one response:
- Default: Batch all approval-required calls into one request (approve/reject all)
- Future: Individual approval mode via config flag

Batch approval reduces friction for common cases where tools are called together.

### 8. A2A protocol extension: `tool-approval-required` state

Add `tool-approval-required` to A2A task states alongside existing `input-required`. This enables external executors to signal approval needs using the standard protocol.

The completions executor doesn't use A2A for internal tool calls, but this extension allows custom executors (LangChain, Claude SDK) to participate in the same approval workflow.

### 9. API endpoint: REST approval submission

```
POST /api/v1/namespaces/{namespace}/queries/{name}/approval
{
  "toolCallId": "call_xyz",
  "action": "approve",  // or "reject"
  "reason": "optional reason"
}
```

Returns updated Query status. Validation ensures the query is in `approval-required` phase and the tool call ID matches.

### 10. Dashboard integration: Approval notification panel

- Pending approvals shown in session view when query enters `approval-required`
- Tool call details displayed (name, arguments, annotations)
- Approve/Reject buttons with optional reason field
- Real-time updates via existing SSE/WebSocket connection to broker

## Risks / Trade-offs

- **Executor state complexity**: The completions executor is currently stateless. Pause/resume requires persisting conversation state. Mitigate by storing full message history in ToolApprovalRequest or a separate state store.

- **Timeout handling**: If approval times out, the query must handle gracefully. `onTimeout: reject` returns error to model; `onTimeout: proceed` skips approval (use with caution).

- **External executor adoption**: Custom executors must implement approval handling. Mitigate by providing clear SDK hooks in `BaseExecutor` and documenting the pattern.

- **Performance overhead**: Approval checks add latency to every tool call. Mitigate by only checking tools with `approval.required: true`; fast path for tools without approval config.

## Open Questions

1. **Approval persistence**: Should approved tool calls be cached to avoid re-approval on retry? Initial implementation: No caching, each execution is independent.

2. **Multi-tenant approval**: Who can approve? Initial implementation: Any user with Query write access. Future: RBAC-based approver roles.

3. **Partial batch approval**: Allow approving some tools in a batch while rejecting others? Initial implementation: All-or-nothing. Future: Per-tool decisions in batch.
