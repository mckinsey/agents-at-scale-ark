# Phase 1: Extract the Ark Execution Engine

## Objective

Make what is implicit explicit. Today the controller IS an execution engine — it contains the v1 completions LLM loop, tool calling, and response handling. Phase 1 extracts this into a standalone component behind A2A, proving the execution engine abstraction with zero user-facing change.

## What We Ship

The Ark controller no longer contains a v1 completions loop. Instead, the completions-based LLM logic lives in a separate container — the **Ark Execution Engine** — that communicates with the controller via A2A. On default install, this engine runs as a sidecar in the controller pod in `ark-system`, with an `ExecutionEngine` CR pointing to it.

```
 ┌─────────────────────────────────────────────────────────┐
 │                CONTROLLER POD (ark-system)               │
 │                                                          │
 │  ┌──────────────┐    A2A (localhost)   ┌──────────────┐ │
 │  │  Ark          │ ◄────────────────► │  Ark          │ │
 │  │  Controller   │                     │  Execution    │ │
 │  │               │                     │  Engine       │ │
 │  │  routes query │                     │  completions  │ │
 │  │  to engine    │                     │  LLM loop     │ │
 │  └──────────────┘                     │  tool calls   │ │
 │                                        └──────────────┘ │
 │  ExecutionEngine CR                                      │
 │  name: ark-default                                       │
 │  address: localhost:PORT                                  │
 └─────────────────────────────────────────────────────────┘
```

## Acceptance Criteria

1. **Engine is a separate container** — The completions LLM loop, tool execution, and response assembly run in an independent container with its own binary, Dockerfile, and test suite. Same Go codebase, different build target.

2. **A2A is the interface** — Controller sends queries to the engine via A2A. Engine returns results via A2A. No shared memory, no function calls across the boundary.

3. **ExecutionEngine CR exists** — Default install creates an `ExecutionEngine` resource in `ark-system`. The controller reads this to find where to send queries. Deleting it disables query execution.

4. **Default topology is sidecar** — The engine runs as a sidecar container in the controller pod, communicating over localhost. No new Deployments or Services needed for the default case.

5. **All existing integration tests pass** — Queries, agents, tools, MCP servers, teams — all continue to work. Zero user-facing change. If it worked before, it works now.

6. **Engine has its own test suite** — Unit and integration tests for the engine module, independent of the controller tests. The engine is a component that may be maintained or replaced independently in future — its tests must stand alone.

7. **Engine is independently testable** — The engine container can be started standalone and exercised via A2A messages without the controller. This proves it's a real boundary, not a refactor-in-name-only.

8. **Tool callbacks work across A2A** — The engine calls back to the controller for Ark-managed tools (MCP servers, Tool CRDs) via A2A `input-required`. This is what the completions engine does today — it must still work across the container boundary.

9. **Minimal CRD change** — The only new CRD is `ExecutionEngine`. No changes to Query, Agent, or Tool CRDs beyond what's needed for engine routing.

## Resolution: Cluster-Level First

The default `ExecutionEngine` lives in `ark-system` — a system-level resource, invisible to tenants. This mirrors the current behaviour: tenants don't see where queries execute. Like the StorageClass pattern — if you don't specify one, you get the default.

## Out of Scope (Phase 1)

- New engine types (Claude, Responses API)
- Namespace-level engine deployment and routing hierarchy
- Rewriting the engine in Python or another language
- Attachments, workspaces, file handling
- Dashboard visibility of engines
- Engine capability annotations
- Session isolation / pod-per-session scheduling
