## Why

Ark agents currently execute tool calls immediately with no human approval gate. When an agent decides to call a tool (HTTP, MCP, agent-to-agent, etc.), execution happens in a tight synchronous loop with no mechanism for a human to approve actions before execution.

This creates several problems:
- **No approval gate**: Sensitive tool calls (database writes, email sending, resource deployment) execute without human oversight
- **Compliance/audit gap**: Organizations with regulatory requirements for human oversight of AI actions cannot enforce approval workflows
- **Trust & safety**: Users building agents for new use cases cannot incrementally build trust by requiring human approval for specific tools while allowing others to run freely
- **Visibility gap**: Users cannot see or intervene in tool execution mid-flight — they only see results after the fact

Industry-standard agentic systems (Claude Code, LangGraph) have established patterns for human-in-the-loop (HITL) tool approvals. Ark should support this pattern natively.

## What Changes

- Add `approval` configuration to `AgentTool` type for per-tool approval requirements (NOT ToolAnnotations — approval requirements are operational, not intrinsic)
- Add `input-required` phase to Query CRD status to represent paused-for-human-approval state (aligning with A2A standard)
- Use existing `A2ATask` CRD to track pending approvals (no new CRD needed)
- Modify the completions executor's `executeToolCalls()` to check approval requirements before tool execution
- Store minimal execution context in A2ATask parameters; fetch conversation history from memory service via `contextId`
- Add event streaming support for real-time approval notifications via ark-broker
- Implement REST API endpoints for approval responses (`POST /queries/{name}/approval`)
- Add Dashboard UI for viewing and responding to pending approvals
- A2A protocol uses `input-required` state for tool approvals (industry standard)

## Capabilities

### New Capabilities
- `tool-approval`: Per-tool approval configuration, Query pause/resume semantics, binary approve/reject decisions for sensitive tools

### Modified Capabilities
- `query-execution`: Query CRD gains `input-required` phase; controller handles pause/resume via A2ATask
- `completions-executor`: Tool execution loop checks approval requirements before calling tools; fetches conversation history from memory service on resume
- `a2a-task-management`: A2ATask parameters store approval context, tool calls, execution index, and conversation reference via `contextId`
- `event-streaming`: New event types for approval requests and responses

## Impact

- **CRD**: `AgentTool` gains `approval` field; Query CRD gains `input-required` phase enum. Requires `make manifests` and Helm chart sync.
- **Go operator**: New types in `api/v1alpha1/`, approval policy evaluation in `executors/completions/`, controller watches A2ATask for approval resume
- **API (Python)**: New approval endpoints, updated Query/Agent/A2ATask models
- **Dashboard (TypeScript)**: Approval notification UI, pending approvals list, approve/reject buttons
- **Broker (Node.js)**: Already has memory service with conversation history retrieval; new event types for approval workflow
- **Tests**: Go unit tests for approval policy, chainsaw e2e tests for full HITL flow
- **Dependencies**: No new dependencies — reuses existing A2ATask CRD, memory service, and streaming infrastructure
