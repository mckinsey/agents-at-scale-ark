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

Add an `approval` block to `AgentTool` (in `agent_types.go`). Do NOT add to `ToolAnnotations`.

Rationale: Approval is an operational concern that varies per-agent, not an intrinsic property of the tool. The same MCP tool might require approval in a production agent but not in a development agent. Placing it on `AgentTool` allows per-agent configuration.

```yaml
spec:
  tools:
    - name: delete-record
      type: http
      approval:
        required: true
        timeout: 5m
        onTimeout: reject  # or "proceed" (WARNING: proceed auto-approves on timeout)
        approvers:         # Authorization control - at least one must match
          - role: admin              # User bound to ClusterRole/Role named "admin"
          - user: ops@example.com    # Specific user identity
          - group: platform-admins   # User in this group
        reasonRequired: false  # Require reason for rejections (audit compliance)
```

**Alternative considered:** Add `requiresApproval` to `ToolAnnotations`. Rejected because it would apply globally to all agents using that tool.

### 2. State management: Hybrid CRD + Event approach

Use a ToolApprovalRequest CRD for persistence and audit trail, combined with event streaming for real-time UX.

**CRD layer (persistence):**
- Query enters `approval-required` phase when tool needs approval
- ToolApprovalRequest CRD created with pending tool call details AND execution context
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
  generation: 1  # Used for optimistic locking
spec:
  queryRef:
    name: query-abc123
    namespace: default
  # Support both single tool call and batch
  toolCalls:
    - id: "call_xyz"
      name: "delete-record"
      type: "http"
      arguments: '{"recordId": "123"}'
      description: "Permanently deletes a customer record from the database"
      annotations:
        destructiveHint: true
        readOnlyHint: false
      agentReasoning: "User requested deletion of record #123"
  timeout: 5m
  onTimeout: reject
  approvers:
    - role: admin
    - user: ops@example.com
    - group: platform-admins
  reasonRequired: false
  # Execution context for resume - CRITICAL for stateless executor
  executionContext:
    conversationHistory: "base64-encoded message array"
    pendingToolCallIndex: 0
    completedToolResults: []
    agentName: "database-assistant"
    agentNamespace: "default"
status:
  phase: pending  # pending, approved, rejected, expired
  # Optimistic locking: observedGeneration must match metadata.generation
  observedGeneration: 1
  requestedAt: "2026-04-29T10:25:00Z"
  decision:
    action: approved  # approved, rejected
    decidedBy: "user@example.com"
    decidedAt: "2026-04-29T10:30:00Z"
    reason: "Verified record can be deleted"
    clientContext:
      ipAddress: "10.0.0.5"
      userAgent: "ark-dashboard/1.0"
  approvalDuration: "5m0s"  # Time between requestedAt and decidedAt
```

Owner reference ensures cleanup when Query is deleted.

### 5. Executor integration: Yield pattern with state capture

Modify `executeToolCalls()` in `agent.go` to check approval policy before each tool call:

```go
for i, tc := range toolCalls {
    if requiresApproval(tc) {
        // Capture full execution context for resume
        context := &ExecutionContext{
            ConversationHistory:   serializeMessages(agentMessages),
            PendingToolCallIndex:  i,
            CompletedToolResults:  completedResults,
            AgentName:             a.Name,
            AgentNamespace:        a.Namespace,
        }
        return newMessages, &ApprovalRequiredError{
            ToolCalls: toolCalls[i:],  // All remaining approval-required tools
            Context:   context,
        }
    }
    // Execute tool, store result
    result := executeToolCall(tc)
    completedResults = append(completedResults, result)
}
```

The executor returns an `ApprovalRequiredError` which signals the handler to:
1. Create ToolApprovalRequest CRD with full execution context
2. Update Query phase to `approval-required`
3. Emit streaming event
4. Exit the current execution (state persisted in CRD)

### 6. Resume mechanism: Re-dispatch with context

When ToolApprovalRequest is approved, the controller re-dispatches the query to the executor with:
- Original conversation history (from `executionContext.conversationHistory`)
- Completed tool results (from `executionContext.completedToolResults`)
- Continuation point (from `executionContext.pendingToolCallIndex`)
- Approval decision (which tools were approved)

```go
func (h *Handler) ResumeFromApproval(ctx context.Context, approval *ToolApprovalRequest) error {
    // Deserialize saved context
    context := deserializeContext(approval.Spec.ExecutionContext)

    // Reconstruct agent state
    messages := context.ConversationHistory
    for _, result := range context.CompletedToolResults {
        messages = append(messages, result)
    }

    // Mark approved tools and continue execution
    approvedTools := extractApprovedTools(approval.Status.Decision)
    return h.executeWithApprovals(ctx, messages, approvedTools)
}
```

This follows LangGraph's pattern of resuming from checkpointed state.

### 7. Multiple tool calls: Batch approval with explicit structure

When the model returns multiple tool calls in one response:
- Group all approval-required calls into a single ToolApprovalRequest
- Use `spec.toolCalls` array (not single `toolCall`)
- Approval/rejection applies to the entire batch

```yaml
spec:
  toolCalls:
    - id: "call_1"
      name: "delete-record"
      arguments: '{"id": "123"}'
    - id: "call_2"
      name: "send-notification"
      arguments: '{"to": "admin"}'
```

**Future enhancement:** Add `allowPartialApproval: true` to enable per-tool decisions within a batch.

### 8. A2A protocol extension: `tool-approval-required` state with callback

Add `tool-approval-required` to A2A task states alongside existing `input-required`. This enables external executors to signal approval needs using the standard protocol.

**A2A Approval Request (executor → controller):**
```json
{
  "jsonrpc": "2.0",
  "method": "tasks/status",
  "params": {
    "taskId": "task-123",
    "status": {
      "state": "tool-approval-required",
      "message": {
        "role": "agent",
        "parts": [{
          "kind": "data",
          "mimeType": "application/vnd.ark.tool-approval-request+json",
          "data": {
            "toolCalls": [...],
            "timeout": "5m",
            "callbackUrl": "https://executor/approval-callback"
          }
        }]
      }
    }
  }
}
```

**A2A Approval Callback (controller → executor):**
```json
POST {callbackUrl}
{
  "taskId": "task-123",
  "decision": {
    "action": "approved",
    "toolCallIds": ["call_1", "call_2"],
    "decidedBy": "user@example.com",
    "reason": "Approved by ops team"
  }
}
```

The executor then resumes execution and sends the next `tasks/status` update.

### 9. API endpoint: REST approval submission with authorization

```
POST /api/v1/namespaces/{namespace}/queries/{name}/approval
Authorization: Bearer <token>
{
  "toolCallId": "call_xyz",  // or "toolCallIds": ["call_1", "call_2"] for batch
  "action": "approve",  // or "reject"
  "reason": "optional reason"
}
```

**Authorization checks (in order):**
1. User must have Kubernetes RBAC permission for ToolApprovalRequest update in the namespace
2. If `spec.approvers` is set, user must match at least one:
   - `role: <name>` → user is bound to a ClusterRole/Role with that name (checked via SubjectAccessReview)
   - `user: ops@example.com` → user identity from authentication context matches
   - `group: platform-admins` → user belongs to the specified group
3. If `spec.reasonRequired: true`, `reason` field must be non-empty for rejections

**Role resolution:** Roles are resolved using Kubernetes RBAC. The API server extracts the authenticated user from the Bearer token (via OIDC, service account, or configured authenticator), then performs a SubjectAccessReview to check if the user has the specified role binding. This integrates with existing Kubernetes identity providers (OIDC, LDAP via Dex, etc.).

Returns HTTP 403 Forbidden if authorization fails.

### 10. Timeout handling with optimistic locking

To prevent race conditions between timeout expiration and approval submission:

**Optimistic locking:**
- ToolApprovalRequest uses `metadata.generation` and `status.observedGeneration`
- Approval submission checks `observedGeneration == generation` before updating
- If mismatch, return HTTP 409 Conflict

**Precedence rules:**
- If approval is submitted BEFORE timeout controller marks expired → approval wins
- Controller checks `status.phase == pending` before setting `expired`
- If phase changed (e.g., to `approved`), controller skips timeout action

```go
func (c *Controller) handleTimeout(ctx context.Context, req *ToolApprovalRequest) error {
    // Optimistic locking check
    if req.Status.Phase != "pending" {
        // Already decided, skip timeout
        return nil
    }

    // Use server-side apply with field manager to detect conflicts
    patch := &ToolApprovalRequest{Status: {Phase: "expired"}}
    return c.client.Status().Patch(ctx, req, patch, client.FieldOwner("timeout-controller"))
}
```

### 11. Performance: Pre-computed approval requirements

To avoid checking approval config on every tool call in the hot path:

**During Agent initialization (in `MakeAgent`):**
```go
type Agent struct {
    // ... existing fields
    approvalRequiredTools map[string]*ToolApprovalConfig  // Pre-computed
}

func MakeAgent(...) (*Agent, error) {
    approvalMap := make(map[string]*ToolApprovalConfig)
    for _, tool := range crd.Spec.Tools {
        if tool.Approval != nil && tool.Approval.Required {
            approvalMap[tool.Name] = tool.Approval
        }
    }
    return &Agent{
        approvalRequiredTools: approvalMap,
        // ...
    }, nil
}
```

**During tool execution (O(1) lookup):**
```go
func (a *Agent) requiresApproval(toolName string) *ToolApprovalConfig {
    return a.approvalRequiredTools[toolName]  // nil if not required
}
```

### 12. Dashboard integration: Approval notification panel

- Pending approvals shown in session view when query enters `approval-required`
- Tool call details displayed: name, arguments, description, annotations (destructiveHint, etc.)
- Agent reasoning shown to help approver understand context
- Timeout countdown displayed
- Approve/Reject buttons with reason field (required if `reasonRequired: true`)
- Real-time updates via existing SSE/WebSocket connection to broker

## Risks / Trade-offs

- **Executor state complexity**: The completions executor is currently stateless. Pause/resume requires persisting conversation state. **Mitigation:** Store full execution context in ToolApprovalRequest CRD (`spec.executionContext`).

- **Conversation history size limit**: The `executionContext.conversationHistory` is stored as base64 in the CRD. etcd has a ~1MB per-object limit. Long-running agents with many tool calls and large context windows could exceed this. **Mitigation:** Implement conversation truncation policy (keep last N messages + system prompt); for very long conversations, store reference to external state (e.g., ConfigMap or dedicated StateStore CRD) instead of inline data. Add validation webhook to reject ToolApprovalRequest if `executionContext` exceeds size threshold.

- **Timeout handling**: Race conditions between timeout and approval. **Mitigation:** Optimistic locking with generation checks; precedence rules favor submitted approvals.

- **A2A callback URL SSRF risk**: The `callbackUrl` in A2A approval requests is provided by external executors. A compromised or malicious executor could provide a callback URL pointing to internal services (SSRF attack). **Mitigation:** Validate callback URLs against allowlist of known executor endpoints; restrict to HTTPS only; reject URLs pointing to cluster-internal addresses (10.x, 192.168.x, kubernetes.default, etc.); consider requiring callback URLs to match the executor's registered address.

- **External executor adoption**: Custom executors must implement approval handling. **Mitigation:** Provide clear A2A callback protocol and SDK hooks in `BaseExecutor`.

- **Performance overhead**: Approval checks add latency. **Mitigation:** Pre-compute approval requirements during Agent initialization; O(1) lookup during execution.

- **Authorization complexity**: Per-tool approver lists add management overhead. **Mitigation:** Start with simple role/user matching; add full RBAC integration later.

## Open Questions

1. **Approval persistence**: Should approved tool calls be cached to avoid re-approval on retry? Initial implementation: No caching, each execution is independent. Future: Consider caching for idempotent tools.

2. **Partial batch approval**: Allow approving some tools in a batch while rejecting others? Initial implementation: All-or-nothing. Future: Add `allowPartialApproval` flag.

3. **Escalation**: What happens if no approver responds within timeout? Initial implementation: Follow `onTimeout` policy. Future: Add escalation to backup approvers.
