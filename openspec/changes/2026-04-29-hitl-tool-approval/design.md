## Context

The agent execution loop in `ark/executors/completions/agent.go` (lines 181-208) runs a tight loop: model completion returns tool calls, `executeToolCalls()` executes them immediately, results feed back to the model. No human interaction mechanism exists.

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
- Per-tool interaction configuration: mark specific tools as requiring human interaction before execution
- Support multiple interaction types: approval (yes/no), input (collect data), selection (choose option), confirmation (review & confirm)
- Query pause/resume: queries can enter an `interaction-required` state and resume after response
- Audit trail: record interaction decisions for compliance
- Real-time UX: clients receive immediate notification when interaction is needed
- Backwards compatibility: agents without HITL config continue executing tools immediately
- Cross-executor support: pattern works for both built-in completions executor and external execution engines
- Extensible design: new interaction types can be added without breaking changes

**Non-Goals:**
- Automated interaction classifiers (like Claude Code's auto-mode) — can be added later
- Complex approval policies (multi-approver, escalation chains) — start with simple patterns
- Interaction for model outputs (only tool calls) — model response interaction is a separate concern

## Decisions

### 1. Interaction configuration location: `AgentTool.interaction` block

Add an `interaction` block to `AgentTool` (in `agent_types.go`). Do NOT add to `ToolAnnotations`.

Rationale: Interaction requirements are operational concerns that vary per-agent, not intrinsic properties of the tool. The same MCP tool might require approval in a production agent but not in a development agent. Placing it on `AgentTool` allows per-agent configuration.

```yaml
spec:
  tools:
    - name: delete-record
      type: http
      interaction:
        type: approval           # approval | input | selection | confirmation
        timeout: 5m
        onTimeout: reject        # reject | proceed (WARNING: proceed auto-accepts on timeout)
        # Type-specific configuration
        approval:
          approvers:
            - role: admin
            - user: ops@example.com
          reasonRequired: false

    - name: deploy-service
      type: http
      interaction:
        type: input
        timeout: 10m
        onTimeout: reject
        input:
          schema:                # JSON Schema for required input
            type: object
            properties:
              environment:
                type: string
                enum: [dev, staging, prod]
              replicas:
                type: integer
                minimum: 1
            required: [environment]
          prompt: "Please provide deployment parameters"

    - name: select-model
      type: http
      interaction:
        type: selection
        timeout: 5m
        selection:
          options:
            - value: "gpt-4"
              label: "GPT-4 (Recommended)"
            - value: "claude-3"
              label: "Claude 3 Opus"
          multiSelect: false
          prompt: "Select which model to use for this task"

    - name: send-email
      type: http
      interaction:
        type: confirmation
        timeout: 5m
        confirmation:
          allowEdit: true        # User can modify arguments before confirming
          message: "Please review the email before sending"
```

**Alternative considered:** Add `requiresApproval` to `ToolAnnotations`. Rejected because it would apply globally to all agents using that tool.

**Alternative considered:** Keep `approval` as separate field. Rejected in favor of unified `interaction` block that supports multiple types.

### 2. State management: Hybrid CRD + Event approach

Use a ToolInteraction CRD for persistence and audit trail, combined with event streaming for real-time UX.

**CRD layer (persistence):**
- Query enters `interaction-required` phase when tool needs human interaction
- ToolInteraction CRD created with pending tool call details, interaction config, AND execution context
- Controller watches ToolInteraction; when response received, signals executor to continue

**Event layer (real-time):**
- Executor emits `ToolInteraction` event to broker immediately
- Connected clients receive notification without polling
- If client disconnects, CRD state persists for later action

**Alternative considered:** Pure event-based (no CRD). Rejected because state would be lost on system restart or client disconnect.

**Alternative considered:** Pure CRD-based (polling only). Rejected because polling adds latency; real-time UX is important for interactive workflows.

### 3. Query phase: Add `interaction-required` to existing enum

Extend the Query status phase enum to include `interaction-required`:
```
pending → running → interaction-required → running → done
                                        ↘ error/canceled
```

The query remains in `interaction-required` until a response is received or timeout occurs. This integrates naturally with existing phase-based state machine.

**Alternative considered:** Create separate CRD without Query phase change. Rejected because it fragments state; Query phase should reflect that execution is paused.

### 4. ToolInteraction CRD structure

```yaml
apiVersion: ark.mckinsey.com/v1alpha1
kind: ToolInteraction
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

  # Interaction type determines which type-specific config applies
  type: approval  # approval | input | selection | confirmation

  # Tool calls pending interaction (supports batching)
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

  # Type-specific configuration (only one populated based on spec.type)
  approval:
    approvers:
      - role: admin
      - user: ops@example.com
    reasonRequired: false

  input:
    schema:
      type: object
      properties:
        environment:
          type: string
      required: [environment]
    prompt: "Please provide deployment parameters"

  selection:
    options:
      - value: "option-a"
        label: "Option A"
      - value: "option-b"
        label: "Option B"
    multiSelect: false
    prompt: "Select an option"

  confirmation:
    allowEdit: true
    message: "Please review before proceeding"

  # Execution context for resume - CRITICAL for stateless executor
  executionContext:
    conversationHistory: "base64-encoded message array"
    pendingToolCallIndex: 0
    completedToolResults: []
    agentName: "database-assistant"
    agentNamespace: "default"

status:
  phase: pending  # pending, completed, rejected, expired
  observedGeneration: 1
  requestedAt: "2026-04-29T10:25:00Z"

  # Generic response structure
  response:
    respondedBy: "user@example.com"
    respondedAt: "2026-04-29T10:30:00Z"
    clientContext:
      ipAddress: "10.0.0.5"
      userAgent: "ark-dashboard/1.0"

    # Type-specific response (only one populated based on spec.type)
    approval:
      action: approved  # approved | rejected
      reason: "Verified record can be deleted"

    input:
      data:
        environment: "prod"
        replicas: 3

    selection:
      selected: ["option-a"]

    confirmation:
      confirmed: true
      modifiedArguments: '{"recordId": "123", "force": true}'  # If allowEdit=true

  responseDuration: "5m0s"  # Time between requestedAt and respondedAt
```

Owner reference ensures cleanup when Query is deleted.

**Shortname:** `ti` (e.g., `kubectl get ti`)

### 5. Executor integration: Yield pattern with state capture

Modify `executeToolCalls()` in `agent.go` to check interaction policy before each tool call:

```go
for i, tc := range toolCalls {
    if interaction := requiresInteraction(tc); interaction != nil {
        // Capture full execution context for resume
        context := &ExecutionContext{
            ConversationHistory:   serializeMessages(agentMessages),
            PendingToolCallIndex:  i,
            CompletedToolResults:  completedResults,
            AgentName:             a.Name,
            AgentNamespace:        a.Namespace,
        }
        return newMessages, &InteractionRequiredError{
            ToolCalls:   toolCalls[i:],  // All remaining interaction-required tools
            Interaction: interaction,     // Interaction config (type, approval/input/etc.)
            Context:     context,
        }
    }
    // Execute tool, store result
    result := executeToolCall(tc)
    completedResults = append(completedResults, result)
}
```

The executor returns an `InteractionRequiredError` which signals the handler to:
1. Create ToolInteraction CRD with full execution context and interaction config
2. Update Query phase to `interaction-required`
3. Emit streaming event
4. Exit the current execution (state persisted in CRD)

### 6. Resume mechanism: Re-dispatch with context

When ToolInteraction receives a response, the controller re-dispatches the query to the executor with:
- Original conversation history (from `executionContext.conversationHistory`)
- Completed tool results (from `executionContext.completedToolResults`)
- Continuation point (from `executionContext.pendingToolCallIndex`)
- Interaction response (approval decision, user input, selection, or modified arguments)

```go
func (h *Handler) ResumeFromInteraction(ctx context.Context, interaction *ToolInteraction) error {
    // Deserialize saved context
    context := deserializeContext(interaction.Spec.ExecutionContext)

    // Reconstruct agent state
    messages := context.ConversationHistory
    for _, result := range context.CompletedToolResults {
        messages = append(messages, result)
    }

    // Apply interaction response and continue execution
    response := interaction.Status.Response
    switch interaction.Spec.Type {
    case "approval":
        if response.Approval.Action == "rejected" {
            return h.handleRejection(ctx, messages, response.Approval.Reason)
        }
    case "input":
        // Merge user-provided input into tool arguments
        mergeInputIntoArguments(toolCalls, response.Input.Data)
    case "selection":
        // Set selected values in tool arguments
        applySelection(toolCalls, response.Selection.Selected)
    case "confirmation":
        if !response.Confirmation.Confirmed {
            return h.handleRejection(ctx, messages, "User declined")
        }
        if response.Confirmation.ModifiedArguments != "" {
            applyModifiedArguments(toolCalls, response.Confirmation.ModifiedArguments)
        }
    }

    return h.continueExecution(ctx, messages, toolCalls)
}
```

This follows LangGraph's pattern of resuming from checkpointed state.

### 7. Multiple tool calls: Batch interaction with explicit structure

When the model returns multiple tool calls in one response:
- Group all interaction-required calls into a single ToolInteraction
- Use `spec.toolCalls` array (not single `toolCall`)
- Response applies to the entire batch

```yaml
spec:
  type: approval
  toolCalls:
    - id: "call_1"
      name: "delete-record"
      arguments: '{"id": "123"}'
    - id: "call_2"
      name: "send-notification"
      arguments: '{"to": "admin"}'
```

**Future enhancement:** Add `allowPartialResponse: true` to enable per-tool decisions within a batch.

### 8. A2A protocol extension: `tool-interaction-required` state with callback

Add `tool-interaction-required` to A2A task states alongside existing `input-required`. This enables external executors to signal interaction needs using the standard protocol.

**A2A Interaction Request (executor → controller):**
```json
{
  "jsonrpc": "2.0",
  "method": "tasks/status",
  "params": {
    "taskId": "task-123",
    "status": {
      "state": "tool-interaction-required",
      "message": {
        "role": "agent",
        "parts": [{
          "kind": "data",
          "mimeType": "application/vnd.ark.tool-interaction+json",
          "data": {
            "type": "approval",
            "toolCalls": [...],
            "timeout": "5m",
            "approval": { "approvers": [...] },
            "callbackUrl": "https://executor/interaction-callback"
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
    "type": "approval",
    "respondedBy": "user@example.com",
    "approval": {
      "action": "approved",
      "reason": "Approved by ops team"
    }
  }
}
```

For input-type interactions:
```json
{
  "taskId": "task-123",
  "response": {
    "type": "input",
    "respondedBy": "user@example.com",
    "input": {
      "data": { "environment": "prod", "replicas": 3 }
    }
  }
}
```

The executor then resumes execution and sends the next `tasks/status` update.

### 9. API endpoint: REST interaction response with authorization

```
POST /api/v1/tool-interactions/{name}/respond
Authorization: Bearer <token>

# For approval type:
{
  "type": "approval",
  "approval": {
    "action": "approve",  // or "reject"
    "reason": "optional reason"
  }
}

# For input type:
{
  "type": "input",
  "input": {
    "data": { "environment": "prod", "replicas": 3 }
  }
}

# For selection type:
{
  "type": "selection",
  "selection": {
    "selected": ["option-a"]
  }
}

# For confirmation type:
{
  "type": "confirmation",
  "confirmation": {
    "confirmed": true,
    "modifiedArguments": "{...}"  // Optional, if allowEdit=true
  }
}
```

**Authorization checks (in order):**
1. User must have Kubernetes RBAC permission for ToolInteraction update in the namespace
2. For approval type with `spec.approval.approvers` set, user must match at least one:
   - `role: <name>` → user is bound to a ClusterRole/Role with that name (checked via SubjectAccessReview)
   - `user: ops@example.com` → user identity from authentication context matches
   - `group: platform-admins` → user belongs to the specified group
3. For approval type with `spec.approval.reasonRequired: true`, `reason` field must be non-empty for rejections
4. For input type, validate `data` against `spec.input.schema` (JSON Schema validation)

**Role resolution:** Roles are resolved using Kubernetes RBAC. The API server extracts the authenticated user from the Bearer token (via OIDC, service account, or configured authenticator), then performs a SubjectAccessReview to check if the user has the specified role binding. This integrates with existing Kubernetes identity providers (OIDC, LDAP via Dex, etc.).

Returns HTTP 403 Forbidden if authorization fails.
Returns HTTP 400 Bad Request if input validation fails.

### 10. Timeout handling with optimistic locking

To prevent race conditions between timeout expiration and response submission:

**Optimistic locking:**
- ToolInteraction uses `metadata.generation` and `status.observedGeneration`
- Response submission checks `observedGeneration == generation` before updating
- If mismatch, return HTTP 409 Conflict

**Precedence rules:**
- If response is submitted BEFORE timeout controller marks expired → response wins
- Controller checks `status.phase == pending` before setting `expired`
- If phase changed (e.g., to `completed`), controller skips timeout action

```go
func (c *Controller) handleTimeout(ctx context.Context, ti *ToolInteraction) error {
    // Optimistic locking check
    if ti.Status.Phase != "pending" {
        // Already responded, skip timeout
        return nil
    }

    // Use server-side apply with field manager to detect conflicts
    patch := &ToolInteraction{Status: {Phase: "expired"}}
    return c.client.Status().Patch(ctx, ti, patch, client.FieldOwner("timeout-controller"))
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
        if tool.Interaction != nil {
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

- Pending interactions shown in session view when query enters `interaction-required`
- Tool call details displayed: name, arguments, description, annotations (destructiveHint, etc.)
- Agent reasoning shown to help user understand context
- Timeout countdown displayed
- Interaction type determines UI:
  - **Approval**: Approve/Reject buttons with optional reason field
  - **Input**: Dynamic form generated from JSON Schema
  - **Selection**: Radio buttons (single) or checkboxes (multi-select) for options
  - **Confirmation**: Review panel with optional argument editor
- Real-time updates via existing SSE/WebSocket connection to broker

## Risks / Trade-offs

- **Executor state complexity**: The completions executor is currently stateless. Pause/resume requires persisting conversation state. **Mitigation:** Store full execution context in ToolInteraction CRD (`spec.executionContext`).

- **Conversation history size limit**: The `executionContext.conversationHistory` is stored as base64 in the CRD. etcd has a ~1MB per-object limit. Long-running agents with many tool calls and large context windows could exceed this. **Mitigation:** Implement conversation truncation policy (keep last N messages + system prompt); for very long conversations, store reference to external state (e.g., ConfigMap or dedicated StateStore CRD) instead of inline data. Add validation webhook to reject ToolInteraction if `executionContext` exceeds size threshold.

- **Timeout handling**: Race conditions between timeout and response submission. **Mitigation:** Optimistic locking with generation checks; precedence rules favor submitted responses.

- **A2A callback URL SSRF risk**: The `callbackUrl` in A2A interaction requests is provided by external executors. A compromised or malicious executor could provide a callback URL pointing to internal services (SSRF attack). **Mitigation:** Validate callback URLs against allowlist of known executor endpoints; restrict to HTTPS only; reject URLs pointing to cluster-internal addresses (10.x, 192.168.x, kubernetes.default, etc.); consider requiring callback URLs to match the executor's registered address.

- **External executor adoption**: Custom executors must implement interaction handling. **Mitigation:** Provide clear A2A callback protocol and SDK hooks in `BaseExecutor`.

- **Performance overhead**: Interaction checks add latency. **Mitigation:** Pre-compute interaction requirements during Agent initialization; O(1) lookup during execution.

- **Authorization complexity**: Per-tool approver lists add management overhead. **Mitigation:** Start with simple role/user matching; add full RBAC integration later.

- **Input validation complexity**: JSON Schema validation for input type adds complexity. **Mitigation:** Use well-established JSON Schema validation library; provide helpful error messages.

## Open Questions

1. **Response persistence**: Should completed interactions be cached to avoid re-prompting on retry? Initial implementation: No caching, each execution is independent. Future: Consider caching for idempotent interactions.

2. **Partial batch response**: Allow responding to some tools in a batch differently? Initial implementation: All-or-nothing. Future: Add `allowPartialResponse` flag.

3. **Escalation**: What happens if no one responds within timeout? Initial implementation: Follow `onTimeout` policy. Future: Add escalation to backup responders.

4. **Input schema evolution**: How to handle schema changes for input-type interactions? Initial implementation: Schema is fixed at interaction creation time. Future: Consider versioned schemas.

5. **Confirmation edit validation**: Should modified arguments in confirmation be validated against the tool's expected schema? Initial implementation: Accept any valid JSON. Future: Add optional argument schema validation.
