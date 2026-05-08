## Why

Ark agents currently execute tool calls immediately with no human interaction gate. When an agent decides to call a tool (HTTP, MCP, agent-to-agent, etc.), execution happens in a tight synchronous loop with no mechanism for a human to review, provide input, or intervene before it runs.

This creates several problems:
- **No interaction gate**: Destructive or sensitive tool calls execute without human oversight
- **No input collection**: Tools cannot pause to collect additional parameters from users
- **Compliance/audit gap**: Organizations with regulatory requirements for human oversight of AI actions cannot enforce interaction workflows
- **Trust & safety**: Users building agents for new use cases cannot incrementally build trust by requiring human interaction for specific tools
- **Visibility gap**: Users cannot see or intervene in tool execution mid-flight — they only see results after the fact

Industry-standard agentic systems (Claude Code, LangGraph) have established patterns for human-in-the-loop (HITL) tool interactions. Ark should support this pattern natively with a generic, extensible design.

## What Changes

- Add `interaction` configuration to `AgentTool` type for per-tool interaction requirements
- Add `interaction-required` phase to Query CRD status to represent paused-for-interaction state
- Create `ToolInteraction` CRD to track pending interactions with audit trail
- Support multiple interaction types: `approval`, `input`, `selection`, `confirmation`
- Modify the completions executor's `executeToolCalls()` to check interaction policy before tool execution
- Add event streaming support for real-time interaction notifications via ark-broker
- Implement REST API endpoints for interaction submission (`POST /tool-interactions/{name}/respond`)
- Add Dashboard UI for viewing and responding to pending interactions
- Extend A2A protocol with `tool-interaction-required` state for external executor support

## Capabilities

### New Capabilities
- `hitl-tool-interaction`: Per-tool interaction configuration, Query pause/resume semantics, ToolInteraction CRD, interaction API endpoints, Dashboard interaction UI, event streaming for interaction notifications

### Modified Capabilities
- `query-execution`: Query CRD gains `interaction-required` phase; controller handles pause/resume
- `completions-executor`: Tool execution loop checks interaction policy before calling tools
- `event-streaming`: New event types for interaction requests and responses
- `a2a-protocol`: New `tool-interaction-required` state for external executor HITL support

## Impact

- **CRD**: `AgentTool` gains `interaction` field; Query CRD gains new phase enum; new `ToolInteraction` CRD. Requires `make manifests` and Helm chart sync.
- **Go operator**: New types in `api/v1alpha1/`, interaction policy evaluation in `executors/completions/`, new ToolInteraction controller
- **API (Python)**: New interaction endpoints, updated Query/Agent models
- **Dashboard (TypeScript)**: Interaction UI supporting approval, input, selection, and confirmation flows
- **Broker (Node.js)**: New event types for interaction workflow
- **Tests**: Go unit tests for interaction policy, chainsaw e2e tests for full HITL flow
- **Dependencies**: No new dependencies — uses existing streaming infrastructure
