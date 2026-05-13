## Context

The agent execution loop in `ark/executors/completions/agent.go` (lines 181-208) runs a tight loop: model completion returns tool calls, `executeToolCalls()` executes them immediately, results feed back to the model. No approval mechanism exists.

Existing infrastructure to leverage:
- **A2A protocol** has `input-required` and `auth-required` phases (used for external A2A task delegation) — reuse for tool approval
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
- Per-tool interaction configuration: mark specific tools as requiring human input before execution
- Query pause/resume: queries can enter `input-required` state and resume after human response
- Generic pattern: support approval as first use case, extensible to confirmation, input, selection
- Audit trail: record human decisions for compliance
- Real-time UX: clients receive immediate notification when input is needed
- Backwards compatibility: agents without interaction config continue executing tools immediately
- Cross-executor support: pattern works for both built-in completions executor and external execution engines

**Non-Goals:**
- Multiple interaction types in MVP — only "approval" type; others (input, confirmation, selection) deferred
- Automated decision classifiers (like Claude Code's auto-mode) — can be added later
- Complex policies (multi-approver, escalation chains) — start with simple binary decisions
- Role-based authorization (approvers field) — defer to phase 2, use RBAC only for MVP
- Interaction for model outputs (only tool calls) — model response approval is a separate concern
- Modification of tool call arguments during interaction — accept/reject only, no edit

## Decisions

### 1. Interaction configuration location: `AgentTool.interaction` block

Add an `interaction` block to `AgentTool` (in `agent_types.go`). Do NOT add to `ToolAnnotations`.

Rationale: Human interaction requirements are operational concerns that vary per-agent, not intrinsic properties of the tool. The same tool might require approval in production but run freely in development. Placing it on `AgentTool` allows per-agent configuration.

```yaml
spec:
  tools:
    - name: delete-record
      type: http
      interaction:
        required: true
        type: approval  # MVP: only "approval" supported; future: "input", "confirmation", "selection"
        timeout: 5m
        onTimeout: reject  # or "proceed" (WARNING: proceed auto-executes on timeout)
        # Phase 2: Add type-specific fields
        # approval:
        #   approvers: [...]
        #   reasonRequired: false
```

**Why `interaction` not `approval`:** This pattern applies to any tool requiring human input (approval, confirmation, text input, selection). Using a generic name allows future expansion while keeping the same architectural pattern.

**Alternative considered:** Add `requiresApproval` to `ToolAnnotations`. Rejected because it would apply globally to all agents using that tool.

### 2. State management: Reuse A2ATask CRD + Event approach

Use existing A2ATask CRD for persistence and audit trail, combined with event streaming for real-time UX.

**CRD layer (persistence):**
- Query enters `input-required` phase when tool needs human input
- A2ATask CRD created with tool interaction details and minimal execution context
- A2ATask.spec.contextId references conversation in memory service (no serialization needed!)
- A2ATask.spec.parameters.interactionType discriminates interaction type ("approval", "input", etc.)
- Controller watches A2ATask; when completed, signals executor to continue

**Event layer (real-time):**
- Executor emits interaction event to broker immediately
- Connected clients receive notification without polling
- If client disconnects, CRD state persists for later action

**Why A2ATask instead of new CRD:**
- A2A protocol already has `input-required` state for human interaction
- A2ATask already links to conversations via `contextId`
- Consistent pattern: all agent pauses (approval, input, auth) use same mechanism
- Generic enough to support multiple interaction types
- No CRD proliferation

**Alternative considered:** Create new ToolInteractionRequest CRD. Rejected because it duplicates A2ATask functionality and creates inconsistent patterns.

### 3. Query phase: Add `input-required` to existing enum

Extend the Query status phase enum to include `input-required`:
```
pending → running → input-required → running → done
                                   ↘ error/canceled
```

The query remains in `input-required` until approval is received or timeout occurs. This integrates naturally with existing phase-based state machine and aligns with A2A protocol semantics.

**Why `input-required` not `approval-required`:**
- Aligns with existing A2A protocol phase naming
- More general — supports future use cases (confirmation dialogs, selection prompts, text input)
- Consistent with A2ATask phase enum which already has `input-required`

### 4. A2ATask structure for tool interactions

Reuse existing A2ATask CRD with generic interaction parameters:

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: A2ATask
metadata:
  name: query-abc123-interaction-0
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
  taskId: "interaction-abc123-0"
  contextId: "conv-xyz-789"  # ← Links to conversation in memory service!
  parameters:
    # Interaction type discriminator (generic!)
    interactionType: "approval"  # or "input", "confirmation", "selection"

    # Tool call details (same for all types)
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

    # Interaction policy (generic)
    timeout: "5m"
    onTimeout: "reject"  # or "proceed"

    # Type-specific fields (future):
    # For interactionType: "input"
    #   prompt: "Enter database password"
    #   inputType: "password"
    # For interactionType: "selection"
    #   options: ["option1", "option2", "option3"]
status:
  phase: "input-required"  # Existing A2ATask phase!
  protocolState: "input-required"
  requestedAt: "2026-04-29T10:25:00Z"
  # Response stored when user responds (format depends on interactionType)
```

**Key advantage:** Conversation history fetched from memory service using `contextId` — no serialization, no size limits!

**Generic pattern:** Same A2ATask structure supports all interaction types; only `interactionType` and response format vary.

Owner reference ensures cleanup when Query is deleted.

### 5. Executor integration: Yield pattern with minimal context

Modify `executeToolCalls()` in `agent.go` to check interaction requirements before each tool call:

```go
for i, tc := range toolCalls {
    if interactionConfig := requiresInteraction(tc); interactionConfig != nil {
        // Capture MINIMAL execution context for resume
        context := &ExecutionContext{
            ConversationID:       memory.GetConversationID(),  // Just the reference!
            PendingToolCallIndex: i,
            CompletedToolResults: completedResults,  // Only results since last model call
            AgentName:            a.Name,
            AgentNamespace:       a.Namespace,
        }
        return newMessages, &InteractionRequiredError{
            InteractionType: interactionConfig.Type,  // "approval", "input", etc.
            ToolCalls:       toolCalls[i:],           // All remaining interaction-required tools
            Config:          interactionConfig,
            Context:         context,
        }
    }
    // Execute tool, store result
    result := executeToolCall(tc)
    completedResults = append(completedResults, result)
}
```

The executor returns an `InteractionRequiredError` which signals the handler to:
1. Create A2ATask with interaction parameters, `interactionType`, and `contextId`
2. Update Query phase to `input-required`
3. Emit streaming event
4. Exit the current execution (state persisted in A2ATask, conversation in memory service)

### 6. Resume mechanism: Fetch from memory service

When A2ATask completes (user responds), the controller re-dispatches the query to the executor with:
- Conversation ID (from `A2ATask.spec.contextId`)
- Completed tool results (from `A2ATask.spec.parameters.completedToolResults`)
- Continuation point (from `A2ATask.spec.parameters.pendingToolCallIndex`)
- User response (format depends on `interactionType`)

```go
func (h *Handler) ResumeFromInteraction(ctx context.Context, task *A2ATask) error {
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

    // Handle response based on interaction type
    interactionType := task.Spec.Parameters["interactionType"]
    switch interactionType {
    case "approval":
        // Binary decision: continue or fail
        if task.Status.Phase == "completed" {
            return h.executeFromIndex(ctx, messages, toolCalls, index)
        }
        return fmt.Errorf("tool call rejected by user")
    case "input":
        // User provided text - add to tool arguments or context
        userInput := task.Spec.Parameters["response"]
        // Future: incorporate input into tool execution
    case "confirmation", "selection":
        // Future: handle other interaction types
    }
}
```

**Key advantage:** No serialization/deserialization, no size limits, leverages existing memory infrastructure!

**Generic pattern:** Same resume flow for all interaction types; only response handling logic varies.

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

### 8. A2A protocol: Reuse existing `input-required` state

The A2A protocol already has `input-required` state for human interaction. Reuse it for all tool interaction types — no protocol changes needed!

**A2A Interaction Request (executor → controller):**
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
          "mimeType": "application/vnd.ark.tool-interaction-request+json",
          "data": {
            "interactionType": "approval",  // or "input", "confirmation", "selection"
            "toolCalls": [...],
            "timeout": "5m",
            "callbackUrl": "https://executor/interaction-callback",
            // Type-specific fields
            "prompt": "Enter password",  // for interactionType: "input"
            "options": ["A", "B", "C"]   // for interactionType: "selection"
          }
        }]
      }
    }
  }
}
```

**A2A Interaction Callback (controller → executor):**
```json
POST {callbackUrl}
{
  "taskId": "task-123",
  "response": {
    "interactionType": "approval",
    "respondedBy": "user@example.com",
    // Type-specific response
    "action": "approved",              // for interactionType: "approval"
    "input": "secret123",              // for interactionType: "input"
    "confirmed": true,                 // for interactionType: "confirmation"
    "selectedOption": "B"              // for interactionType: "selection"
  }
}
```

The executor then resumes execution (fetching conversation from memory service) and sends the next `tasks/status` update.

**MIME type evolution:** For MVP, use `application/vnd.ark.tool-interaction-request+json` (generic). Future: support type-specific MIME types if needed.

### 9. API endpoint: REST interaction response with RBAC

```
POST /api/v1/namespaces/{namespace}/queries/{name}/interaction
Authorization: Bearer <token>
{
  "interactionType": "approval",  // Must match A2ATask interactionType
  "toolCallId": "call_xyz",       // or "toolCallIds": ["call_1", "call_2"] for batch

  // Type-specific response fields
  "action": "approve",            // for interactionType: "approval"
  "input": "user-provided-text",  // for interactionType: "input"
  "confirmed": true,              // for interactionType: "confirmation"
  "selectedOption": "option2"     // for interactionType: "selection"
}
```

**Authorization checks (MVP - Phase 1):**
1. User must have Kubernetes RBAC permission for A2ATask update in the namespace
2. Return HTTP 403 Forbidden if RBAC check fails

**Response validation:**
- API validates response matches expected `interactionType`
- Returns HTTP 400 Bad Request if response format doesn't match interaction type

**Phase 2 (future):**
- Add type-specific authorization (e.g., `spec.interaction.approval.approvers`)
- Add type-specific validation (e.g., `spec.interaction.input.pattern`)

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

### 11. Performance: Pre-computed interaction requirements

To avoid checking interaction config on every tool call in the hot path:

**During Agent initialization (in `MakeAgent`):**
```go
type Agent struct {
    // ... existing fields
    interactionRequiredTools map[string]*ToolInteractionConfig  // Pre-computed
}

func MakeAgent(...) (*Agent, error) {
    interactionMap := make(map[string]*ToolInteractionConfig)
    for _, tool := range crd.Spec.Tools {
        if tool.Interaction != nil && tool.Interaction.Required {
            interactionMap[tool.Name] = tool.Interaction
        }
    }
    return &Agent{
        interactionRequiredTools: interactionMap,
        // ...
    }, nil
}
```

**During tool execution (O(1) lookup):**
```go
func (a *Agent) requiresInteraction(toolName string) *ToolInteractionConfig {
    return a.interactionRequiredTools[toolName]  // nil if not required
}
```

### 12. Dashboard integration: Interaction UI panel

- Pending interactions shown in session view when query enters `input-required`
- Tool call details displayed: name, arguments, description, annotations (destructiveHint, etc.)
- Agent reasoning shown to help user understand context
- Timeout countdown displayed
- Interaction UI varies by type:
  - `approval`: Approve/Reject buttons
  - `input`: Text input field (Phase 2)
  - `confirmation`: Yes/No buttons (Phase 2)
  - `selection`: Option buttons or dropdown (Phase 2)
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
