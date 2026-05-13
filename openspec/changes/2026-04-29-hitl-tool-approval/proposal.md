## Why

Ark agents currently execute tool calls immediately with no human interaction gate. When an agent decides to call a tool (HTTP, MCP, agent-to-agent, etc.), execution happens in a tight synchronous loop with no mechanism for a human to provide input, confirm actions, or approve decisions before execution.

This creates several problems:
- **No interaction gate**: Sensitive tool calls (database writes, email sending, resource deployment) execute without human oversight or input
- **Compliance/audit gap**: Organizations with regulatory requirements for human oversight of AI actions cannot enforce approval workflows
- **Trust & safety**: Users building agents for new use cases cannot incrementally build trust by requiring human confirmation for specific tools while allowing others to run freely
- **Missing inputs**: Tools that need runtime information from users (passwords, selections, confirmations) cannot request them
- **Visibility gap**: Users cannot see or intervene in tool execution mid-flight — they only see results after the fact

Industry-standard agentic systems (Claude Code, LangGraph) have established patterns for human-in-the-loop (HITL) tool interactions. Ark should support this pattern natively.

## What Changes

- Add `interaction` configuration to `AgentTool` type for per-tool interaction requirements (NOT ToolAnnotations — interaction requirements are operational, not intrinsic)
- Add `input-required` phase to Query CRD status to represent paused-for-human-input state
- Use existing `A2ATask` CRD to track pending interactions with `interactionType` discriminator (no new CRD needed)
- Modify the completions executor's `executeToolCalls()` to check interaction requirements before tool execution
- Store minimal execution context in A2ATask parameters; fetch conversation history from memory service via `contextId`
- Add event streaming support for real-time interaction notifications via ark-broker
- Implement REST API endpoints for interaction responses (`POST /queries/{name}/interaction`)
- Add Dashboard UI for viewing and responding to pending interactions
- A2A protocol already supports `input-required` state — reuse for all tool interactions
- **MVP scope:** Implement `interactionType: "approval"` only; defer other types (input, confirmation, selection) to Phase 2

## Capabilities

### New Capabilities
- `hitl-tool-interaction`: Per-tool interaction configuration, Query pause/resume semantics, generic interaction pattern supporting multiple types (approval, input, confirmation, selection)
- `tool-approval-mvp`: First interaction type implementation — binary approve/reject decisions for sensitive tools

### Modified Capabilities
- `query-execution`: Query CRD gains `input-required` phase; controller handles pause/resume via A2ATask
- `completions-executor`: Tool execution loop checks interaction requirements before calling tools; fetches conversation history from memory service on resume
- `a2a-task-management`: A2ATask parameters store interaction context with `interactionType` discriminator, tool calls, execution index, and conversation reference via `contextId`
- `event-streaming`: New event types for interaction requests and responses

## Impact

- **CRD**: `AgentTool` gains `interaction` field; Query CRD gains `input-required` phase enum; A2ATask parameters extended with `interactionType`. Requires `make manifests` and Helm chart sync.
- **Go operator**: New types in `api/v1alpha1/`, interaction policy evaluation in `executors/completions/`, controller watches A2ATask for interaction resume
- **API (Python)**: New interaction endpoints, updated Query/Agent/A2ATask models
- **Dashboard (TypeScript)**: Interaction notification UI, pending interactions list, type-specific response controls (MVP: approve/reject buttons)
- **Broker (Node.js)**: Already has memory service with conversation history retrieval; new event types for interaction workflow
- **Tests**: Go unit tests for interaction policy, chainsaw e2e tests for full HITL flow
- **Dependencies**: No new dependencies — reuses existing A2ATask CRD, memory service, and streaming infrastructure
