## Why

Ark agents currently execute tool calls immediately with no approval gate. When an agent decides to call a tool (HTTP, MCP, agent-to-agent, etc.), execution happens in a tight synchronous loop with no mechanism for a human to review, approve, or reject the action before it runs.

This creates several problems:
- **No approval gate**: Destructive or sensitive tool calls (database writes, email sending, resource deployment) execute without human oversight
- **Compliance/audit gap**: Organizations with regulatory requirements for human oversight of AI actions cannot enforce approval workflows
- **Trust & safety**: Users building agents for new use cases cannot incrementally build trust by requiring approval for specific tools while allowing others to run freely
- **Visibility gap**: Users cannot see or intervene in tool execution mid-flight — they only see results after the fact

Industry-standard agentic systems (Claude Code, LangGraph) have established patterns for human-in-the-loop (HITL) tool approval. Ark should support this pattern natively.

## What Changes

- Add `approval` configuration to `AgentTool` and `ToolAnnotations` types for per-tool approval requirements
- Add `approval-required` phase to Query CRD status to represent paused-for-approval state
- Create `ToolApprovalRequest` CRD to track pending approvals with audit trail
- Modify the completions executor's `executeToolCalls()` to check approval policy before tool execution
- Add event streaming support for real-time approval notifications via ark-broker
- Implement REST API endpoints for approval submission (`POST /queries/{name}/approval`)
- Add Dashboard UI for viewing and acting on pending approvals
- Extend A2A protocol with `tool-approval-required` state for external executor support

## Capabilities

### New Capabilities
- `hitl-tool-approval`: Per-tool approval configuration, Query pause/resume semantics, ToolApprovalRequest CRD, approval API endpoints, Dashboard approval UI, event streaming for approval notifications

### Modified Capabilities
- `query-execution`: Query CRD gains `approval-required` phase; controller handles pause/resume
- `completions-executor`: Tool execution loop checks approval policy before calling tools
- `event-streaming`: New event types for approval requests and decisions
- `a2a-protocol`: New `tool-approval-required` state for external executor HITL support

## Impact

- **CRD**: `AgentTool` and `ToolAnnotations` gain approval fields; Query CRD gains new phase enum; new `ToolApprovalRequest` CRD. Requires `make manifests` and Helm chart sync.
- **Go operator**: New types in `api/v1alpha1/`, approval policy evaluation in `executors/completions/`, new ToolApprovalRequest controller
- **API (Python)**: New approval endpoints, updated Query/Agent models
- **Dashboard (TypeScript)**: Approval notification UI, pending approvals list, approve/reject actions
- **Broker (Node.js)**: New event types for approval workflow
- **Tests**: Go unit tests for approval policy, chainsaw e2e tests for full HITL flow
- **Dependencies**: No new dependencies — uses existing streaming infrastructure
