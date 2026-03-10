# Ark Query Engine

## What

Extract the LLM execution loop from the Ark controller into a standalone A2A service, deployed as a sidecar in the controller pod.

## Why

The controller currently embeds the full turn loop — prompt building, LLM calls, tool execution, streaming, memory, and team orchestration. This couples orchestration (K8s reconciliation) with execution (LLM interaction). Separating them:

- Enables independent scaling and replacement of the execution engine
- Makes the ExecutionEngine CRD the default path, not an opt-in override
- Reduces controller complexity to a thin K8s reconciler
- Allows future deployment topologies (remote engines, per-namespace engines)

## Scope

**In scope:**
- New binary: `ark/cmd/query-engine/main.go` (same Go module as ark/)
- A2A server receiving `protocol.Message` with query/target metadata
- Full turn loop: agent execution, team orchestration, tool calling, streaming, memory
- Sidecar deployment in controller pod via Helm chart
- Controller flag for sidecar address (default: `http://localhost:9090`)
- Controller refactored to delegate execution via A2A SendMessage

**Out of scope:**
- Separate Go module (Phase 2)
- Remote/distributed engine deployment (Phase 2)
- Separate ServiceAccount/RBAC (shares controller SA as sidecar)
- Changes to user-facing API (Query CR spec unchanged)
- A2A native streaming (progressive task updates over A2A protocol)
- A2A native tool call support (tool negotiation via A2A protocol)
