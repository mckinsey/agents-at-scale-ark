## Context

The agent execution loop in `ark/executors/completions/agent.go` (lines 181-208) runs a tight loop: model completion returns tool calls, `executeToolCalls()` executes them immediately, results feed back to the model. No approval mechanism exists.

Existing infrastructure to leverage:
- **A2A protocol** uses `input-required` state (industry standard) for tool approvals
- **A2ATask CRD** already exists for tracking A2A interactions with `contextId` linking to conversations
- **Memory service** (ark-broker) stores conversation history indexed by `conversationId` — no need to serialize into CRD
- **Event streaming** via ark-broker delivers real-time chunks to clients
- **Tool annotations** (`DestructiveHint`, `ReadOnlyHint`) exist but are informational only
- **Query CRD** has phases `pending → running → error/done/canceled`

Industry patterns researched:
- **LangGraph**: Uses `interrupt()` function with checkpointer for state persistence; resumes via `Command(resume=value)`
- **Claude Code**: Permission rules (Allow/Ask/Deny) with auto-mode classifiers and hooks for programmatic control

## Goals / Non-Goals

**Goals:**
- Per-tool approval configuration: mark specific tools as requiring human approval before execution
- Query pause/resume: queries can enter `approval-required` state and resume after human response
- Audit trail: record human decisions for compliance
- Real-time UX: clients receive immediate notification when approval is needed
- Backwards compatibility: agents without approval config continue executing tools immediately
- Cross-executor support: pattern works for both built-in completions executor and external execution engines

**Non-Goals:**
- Automated decision classifiers (like Claude Code's auto-mode) — can be added later
- Complex policies (multi-approver, escalation chains) — start with simple binary decisions
- Role-based authorization (approvers field) — defer to phase 2, use RBAC only for MVP
- Modification of tool call arguments during approval — accept/reject only, no edit

## Decisions

### 1. Approval configuration location: `AgentTool.approval` block

Add an `approval` block to `AgentTool` (in `agent_types.go`). Do NOT add to `ToolAnnotations`.

Rationale: Human approval requirements are operational concerns that vary per-agent, not intrinsic properties of the tool. The same tool might require approval in production but run freely in development. Placing it on `AgentTool` allows per-agent configuration.

```yaml
spec:
  tools:
    - name: delete-record
      type: http
      approval:
        required: true
        timeout: 5m
        onTimeout: reject  # or "proceed" (WARNING: proceed auto-executes on timeout)
        # Phase 2: Add approval-specific fields
        # approvers: [...]
        # reasonRequired: false
```

**Alternative considered:** Add `requiresApproval` to `ToolAnnotations`. Rejected because it would apply globally to all agents using that tool.

### 2. State management: Reuse A2ATask CRD + Event approach

Use existing A2ATask CRD for persistence and audit trail, combined with event streaming for real-time UX.

**CRD layer (persistence):**
- Query enters `input-required` phase when tool needs human approval
- A2ATask CRD created with tool approval details and minimal execution context
- A2ATask.spec.contextId references conversation in memory service (no serialization needed!)
- Controller watches A2ATask; when completed, signals executor to continue

**Event layer (real-time):**
- Executor emits approval event to broker immediately
- Connected clients receive notification without polling
- If client disconnects, CRD state persists for later action

**Why A2ATask instead of new CRD:**
- A2A protocol standard uses `input-required` state
- A2ATask already links to conversations via `contextId`
- Consistent pattern: all agent pauses use same mechanism
- No CRD proliferation

**Alternative considered:** Create new ToolApprovalRequest CRD. Rejected because it duplicates A2ATask functionality and creates inconsistent patterns.

### 3. Query phase: Add `input-required` to existing enum

Extend the Query status phase enum to include `input-required`:
```
pending → running → input-required → running → done
                                   ↘ error/canceled
```

The query remains in `input-required` until approval is received or timeout occurs. This integrates naturally with existing phase-based state machine and aligns with A2A protocol standard.

### 4. A2ATask structure for tool approvals

Reuse existing A2ATask CRD for approval tracking:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: A2ATask
metadata:
  name: query-abc123-approval-0
  namespace: default
  ownerReferences:
    - kind: Query
      name: query-abc123
spec:
  queryRef:
    name: query-abc123
    namespace: default
  agentRef:
    name: database-assistant
    namespace: default
  taskId: "approval-abc123-0"
  contextId: "conv-xyz-789"  # ← Links to conversation in memory service!
  parameters:
    # Tool call details
    toolCalls: |
      [{
        "id": "call_xyz",
        "name": "delete-record",
        "type": "http",
        "arguments": "{\"recordId\": \"123\"}",
        "description": "Permanently deletes a customer record",
        "annotations": {"destructiveHint": true},
        "agentReasoning": "User requested deletion of record #123"
      }]

    # Minimal execution context (NOT full conversation history!)
    pendingToolCallIndex: "0"
    completedToolResults: "[]"

    # Approval policy
    timeout: "5m"
    onTimeout: "reject"  # or "proceed"
status:
  phase: "input-required"
  protocolState: "input-required"
  requestedAt: "2026-04-29T10:25:00Z"
  # Response stored when user responds
```

**Key advantage:** Conversation history fetched from memory service using `contextId` — no serialization, no size limits!

Owner reference ensures cleanup when Query is deleted.

### 5. Executor integration: Yield pattern with minimal context

Modify `executeToolCalls()` in `agent.go` to check approval requirements before each tool call:

```go
for i, tc := range toolCalls {
    if approvalConfig := requiresApproval(tc); approvalConfig != nil {
        // Capture MINIMAL execution context for resume
        context := &ExecutionContext{
            ConversationID:       memory.GetConversationID(),  // Just the reference!
            PendingToolCallIndex: i,
            CompletedToolResults: completedResults,  // Only results since last model call
            AgentName:            a.Name,
            AgentNamespace:       a.Namespace,
        }
        return newMessages, &ApprovalRequiredError{
            ToolCalls:       toolCalls[i:],           // All remaining approval-required tools
            Config:          approvalConfig,
            Context:         context,
        }
    }
    // Execute tool, store result
    result := executeToolCall(tc)
    completedResults = append(completedResults, result)
}
```

The executor returns an `ApprovalRequiredError` which signals the handler to:
1. Create A2ATask with approval parameters and `contextId`
2. Update Query phase to `input-required`
3. Emit streaming event
4. Exit the current execution (state persisted in A2ATask, conversation in memory service)

### 6. Resume mechanism: Fetch from memory service

When A2ATask completes (user responds), the controller re-dispatches the query to the executor with:
- Conversation ID (from `A2ATask.spec.contextId`)
- Completed tool results (from `A2ATask.spec.parameters.completedToolResults`)
- Continuation point (from `A2ATask.spec.parameters.pendingToolCallIndex`)
- User response

```go
func (h *Handler) ResumeFromApproval(ctx context.Context, task *A2ATask) error {
    // Get conversation ID from task
    conversationID := task.Spec.ContextID

    // Fetch conversation history from memory service (NOT from CRD!)
    memory := NewHTTPMemory(ctx, conversationID)
    messages, err := memory.GetMessages(ctx)  // Already implemented!
    if err != nil {
        return fmt.Errorf("failed to fetch conversation history: %w", err)
    }

    // Apply completed tool results (from task parameters)
    completedResults := parseCompletedResults(task.Spec.Parameters["completedToolResults"])
    messages = append(messages, completedResults...)

    // Handle approval response
    if task.Status.Phase == "completed" {
        return h.executeFromIndex(ctx, messages, toolCalls, index)
    }
    return fmt.Errorf("tool call rejected by user")
}
```

**Key advantage:** No serialization/deserialization, no size limits, leverages existing memory infrastructure!

### 7. Multiple tool calls: Batch approval with explicit structure

When the model returns multiple tool calls in one response:
- Group all approval-required calls into a single A2ATask
- Use `spec.parameters.toolCalls` array (not single `toolCall`)
- Approval/rejection applies to the entire batch

```yaml
spec:
  parameters:
    toolCalls: |
      [{
        "id": "call_1",
        "name": "delete-record",
        "arguments": "{\"id\": \"123\"}"
      },
      {
        "id": "call_2",
        "name": "send-notification",
        "arguments": "{\"to\": \"admin\"}"
      }]
```

**Future enhancement:** Add `allowPartialApproval: true` to enable per-tool decisions within a batch.

### 8. A2A protocol: Use `input-required` state

The A2A protocol uses `input-required` state for tool approvals (aligning with A2A standard).

**A2A Approval Request (executor → controller):**
```json
{
  "jsonrpc": "2.0",
  "method": "tasks/status",
  "params": {
    "taskId": "task-123",
    "status": {
      "state": "input-required",
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
  "response": {
    "respondedBy": "user@example.com",
    "action": "approved"  // or "rejected"
  }
}
```

The executor then resumes execution (fetching conversation from memory service) and sends the next `tasks/status` update.

### 9. API endpoint: REST approval response with RBAC

```
POST /api/v1/namespaces/{namespace}/queries/{name}/approval
Authorization: Bearer <token>
{
  "toolCallId": "call_xyz",       // or "toolCallIds": ["call_1", "call_2"] for batch
  "action": "approve"             // or "reject"
}
```

**Authorization checks (MVP - Phase 1):**
1. User must have Kubernetes RBAC permission for A2ATask update in the namespace
2. Return HTTP 403 Forbidden if RBAC check fails

**Phase 2 (future):**
- Add approval-specific authorization (e.g., `spec.approval.approvers`)
- Add approval-specific validation (e.g., `spec.approval.reasonRequired`)

### 10. Timeout handling with optimistic locking

To prevent race conditions between timeout expiration and approval submission:

**Optimistic locking:**
- A2ATask uses `metadata.generation` and `status.observedGeneration` (standard K8s pattern)
- Approval submission checks phase == `input-required` before updating
- If phase already changed, return HTTP 409 Conflict

**Precedence rules:**
- If approval is submitted BEFORE timeout controller marks expired → approval wins
- Controller checks `status.phase == "input-required"` before setting `expired`
- If phase changed (e.g., to `completed`), controller skips timeout action

```go
func (c *Controller) handleTimeout(ctx context.Context, task *A2ATask) error {
    // Optimistic locking check
    if task.Status.Phase != "input-required" {
        // Already decided, skip timeout
        return nil
    }

    // Use server-side apply with field manager to detect conflicts
    patch := &A2ATask{Status: {Phase: "expired"}}
    return c.client.Status().Patch(ctx, task, patch, client.FieldOwner("timeout-controller"))
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

### 12. Dashboard integration: Approval UI panel

- Pending approvals shown in session view when query enters `input-required`
- Tool call details displayed: name, arguments, description, annotations (destructiveHint, etc.)
- Agent reasoning shown to help user understand context
- Timeout countdown displayed
- Approve/Reject buttons
- Real-time updates via existing SSE/WebSocket connection to broker

## Risks / Trade-offs

- **Executor state complexity**: The completions executor is currently stateless. Pause/resume requires accessing conversation state. **Mitigation:** Fetch conversation history from memory service using `contextId` — no serialization needed, leverages existing infrastructure.

- **Memory service availability**: Resume depends on memory service being available. **Mitigation:** Memory service is already critical path for all queries; no new dependency introduced. If memory service is down, queries already fail.

- **Timeout handling**: Race conditions between timeout and approval. **Mitigation:** Optimistic locking with generation checks; precedence rules favor submitted approvals.

- **A2A callback URL SSRF risk**: The `callbackUrl` in A2A approval requests is provided by external executors. A compromised or malicious executor could provide a callback URL pointing to internal services (SSRF attack). **Mitigation:** Validate callback URLs against allowlist of known executor endpoints; restrict to HTTPS only; reject URLs pointing to cluster-internal addresses (10.x, 192.168.x, kubernetes.default, etc.); consider requiring callback URLs to match the executor's registered address.

- **External executor adoption**: Custom executors must implement approval handling. **Mitigation:** Provide clear A2A callback protocol and SDK hooks in `BaseExecutor`.

- **Performance overhead**: Approval checks add latency. **Mitigation:** Pre-compute approval requirements during Agent initialization; O(1) lookup during execution.

## Open Questions

1. **Approval persistence**: Should approved tool calls be cached to avoid re-approval on retry? Initial implementation: No caching, each execution is independent. Future: Consider caching for idempotent tools.

2. **Partial batch approval**: Allow approving some tools in a batch while rejecting others? Initial implementation: All-or-nothing. Future: Add `allowPartialApproval` flag.

3. **Escalation**: What happens if no approver responds within timeout? Initial implementation: Follow `onTimeout` policy. Future: Add escalation to backup approvers.

4. **A2ATask status extension**: Should we extend A2ATask status to store approval decision details, or use parameters for response? Initial implementation: Use parameters for symmetry with request. Future: Evaluate if dedicated status fields improve audit trail.
