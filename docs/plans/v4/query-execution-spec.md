# Modular Query Execution

## Core Model

An execution engine is a service that runs queries. The Ark controller ships with one — the Ark Execution Engine — which handles completions, tools, models, and teams out of the box. Users deploy additional engines as namespace-scoped A2A servers. Agents reference engines by name.

The ExecutionEngine CRD is a named pointer. It stores an address — the controller itself, a Kubernetes Service, or an external URL. The controller resolves the address and sends queries there via A2A. What runs behind the address is the engine's business.

The nice thing: everything is an execution engine, A2A is the message format, execution engines _can_ schedule if they need to, we _can_ have simple or complex workspace / pvc logic, we _can_ have engines handle extra fields in agents or annotations etc. Suggested approach would be to have the default ark have the main ark system execution engine for stateless v1 completions, and super quick demo on how to deploy responses or claude engine per namespace out of the box.

Off the back of this we build the v2 claude engine that optionally schedules by session, and can show how to do workspaces / pvcs per engine, session or agent.

## Three Levels of Engine Sophistication

### 1. In-Process (Ark Execution Engine)

The default ExecutionEngine lives in `ark-system` and points to the Ark controller itself. Agents that don't specify an engine use this one.

```
 ┌──────────────────────────────────────────────────────┐
 │            ARK CONTROLLER (ark-system)                │
 │                                                       │
 │  ExecutionEngine CR          Query Controller          │
 │  name: ark (default)         │                        │
 │  address: → self             │                        │
 │                              ▼                        │
 │  Query ──▶ Agent ──▶ ┌─────────────────────┐          │
 │                      │ Ark Execution Engine │          │
 │                      │ prompt → LLM → tools│          │
 │                      │ → loop → response   │          │
 │                      └─────────────────────┘          │
 └──────────────────────────────────────────────────────┘
```

- A2A completions-based engine running in-process in the controller, exposing HTTP/A2A.
- What we have today — handles tools, models, queries, teams — but now a named module with its own ExecutionEngine CR.

### 2. Per-Namespace or Custom (e.g., Claude Engine)

A separate engine deployed as a single Deployment, Service, and A2A server in a namespace.

```
 ┌───────────────┐               ┌─────────────────────────────────┐
 │ ARK CONTROLLER│     A2A       │  Claude Execution Engine         │
 │ (ark-system)  │──────────────▶│  (Deployment + Service + A2A)   │
 │               │               │                                  │
 │ agent.engine  │               │  Session A (in-memory)           │
 │ = "claude"    │               │  ├─ claude --resume A            │
 │               │               │  Session B (in-memory)           │
 │               │               │  ├─ claude --resume B            │
 └───────────────┘               └─────────────────────────────────┘
```

- A single Deployment runs all sessions in-memory. Sessions share the pod.
- Similar to [`claude-code-agent`](https://github.com/dwmkerr/claude-code-agent) pattern: A2A server spawning Claude Code CLI per message with `--resume`.
- Workspaces can be attached as PVCs later, but no guaranteed isolation between sessions.

### 3. Scheduling (e.g., Claude Scheduler Engine)

An engine that acts as a router and scheduler, creating a dedicated pod as needed based on rules (eg per session, per agent, whatever).

```
 ┌───────────────┐               ┌─────────────────────────────────┐
 │ ARK CONTROLLER│     A2A       │  Claude Scheduler Engine         │
 │ (ark-system)  │──────────────▶│  (Deployment + Service + A2A)   │
 │               │               │                                  │
 │ agent.engine  │               │  session map:                    │
 │ = "claude-    │               │    A → pod-session-a             │
 │  scheduler"   │               │    B → pod-session-b             │
 └───────────────┘               └──────┬──────────┬───────────────┘
                                        │          │
                                   ┌────▼────┐ ┌───▼─────┐
                                   │ Pod A   │ │ Pod B   │
                                   │ A2A srv │ │ A2A srv │
                                   │ PVC 10Gi│ │ PVC 10Gi│
                                   └─────────┘ └─────────┘
```

- The engine functions as a mini-scheduler: create pod on new session, route on existing, delete on idle timeout.
- Pod specs come from PodTemplate resources. The engine or agent annotations select which template to use.
- The engine receives the full agent spec via A2A metadata and can read annotations — e.g., "this agent needs GPU, schedule with the gpu-heavy template."

## ExecutionEngine CRD

One new optional field:

- **`spec.config`**: `map[string]string` passed to the engine via A2A metadata. Controller does not interpret it. Engines define what keys they accept.

Agents override engine config via annotations (`executors.ark.mckinsey.com/<engine>.<key>`). Session-isolated engines use `podTemplate` annotations on agents to select per-agent pod specs.

## Principles

1. The CRD points to a service. The CRD can be customised with annotations and config.
2. The service is A2A and handles queries however it wants. It receives the agent/team/etc so it can read additional data if needed (e.g., Claude Code annotations on an agent).
3. A service can reject a query it can't execute (e.g., a query with a Responses-specific annotation the engine doesn't support).
4. External engines are A2A servers. Agents reference them by name.
5. Engines manage themselves. The controller doesn't know about pods, sessions, or Claude Code.
6. The service behind an engine is the execution logic. The engine is a router and optional scheduler.
