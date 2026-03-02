# Phase 1: Extract the Ark Query Engine

Extract the v1 completions loop from the controller into `services/ark-query-engine/`. Go for compatibility. Separate container, A2A boundary. Default install runs it as a sidecar in the controller pod. Zero user-facing change.

```
 ┌─────────────────────────────────────────────────────────┐
 │                CONTROLLER POD (ark-system)               │
 │                                                          │
 │  ┌──────────────┐    A2A (localhost)   ┌──────────────┐ │
 │  │  Ark          │ ◄────────────────► │  Ark Query    │ │
 │  │  Controller   │                     │  Engine       │ │
 │  │               │                     │               │ │
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

1. **Separate container** — Engine has its own binary, Dockerfile, and test suite in `services/ark-query-engine/`. Go module, 100% test coverage enforced.
2. **A2A boundary** — Controller and engine communicate exclusively via A2A. No shared memory, no function calls.
3. **ExecutionEngine CR** — The CRD already exists. Default install creates one in `ark-system`. Controller reads it to route queries. Deleting it disables query execution.
4. **Tool callbacks** — Engine calls back to the controller for Ark-managed tools (MCP servers, Tool CRDs) via `input-required`.
5. **Unit tests with 100% coverage** — The new module is a reference implementation. Full coverage enforced in CI.
6. **All existing e2e tests pass** — Queries, agents, tools, MCP, teams all work as before. Existing Ark e2e tests validate the integration.

## Scope Decisions

**Cluster-level only.** The default `ExecutionEngine` lives in `ark-system`, invisible to tenants.

**Out of scope:** new engine types, namespace-level engines, language rewrites, attachments/workspaces, dashboard changes, capability annotations, session isolation, standalone engine integration tests.
