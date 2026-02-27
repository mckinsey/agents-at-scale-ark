# Modular Query Execution

## Core Model

An execution engine is a service that runs queries. The ExecutionEngine CRD is a named pointer — it stores an address (the controller itself, a K8s Service, or an external URL). The controller resolves the address and sends queries via A2A. What runs behind the address is the engine's business.

Everything is an execution engine. A2A is the message format. Engines _can_ schedule, _can_ have workspace/PVC logic, _can_ handle extra agent fields or annotations. v1: default Ark engine for stateless completions, demo deploying Claude engine per namespace. v2: Claude engine that optionally schedules by session, with workspaces/PVCs per engine, session, or agent.

## Three Levels of Engine Sophistication

### 1. In-Process (Ark Execution Engine)

Default engine in `ark-system`, points to the controller itself.

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

- What we have today — tools, models, queries, teams — but now a named module with its own ExecutionEngine CR.

### 2. Per-Namespace or Custom (e.g., Claude Engine)

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

- Single Deployment, all sessions in-memory. [`claude-code-agent`](https://github.com/dwmkerr/claude-code-agent) pattern: A2A server spawning Claude Code CLI per message with `--resume`.
- Workspaces can attach as PVCs later, but no guaranteed isolation.

### 3. Scheduling (e.g., Claude Scheduler Engine)

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

- Mini-scheduler: create pod on new session, route on existing, delete on idle.
- Pod specs from PodTemplate resources. Engine or agent annotations select which template.
- Engine receives full agent spec via A2A metadata — can read annotations like "this agent needs GPU."

## ExecutionEngine CRD

One new field: **`spec.config`** (`map[string]string`) passed to the engine via A2A metadata. Controller does not interpret it. Agents override via annotations (`executors.ark.mckinsey.com/<engine>.<key>`).

## Principles

1. The CRD points to a service. Customised with annotations and config.
2. The service is A2A. It receives the agent/team and can read annotations.
3. Engines can reject queries they can't execute.
4. Engines manage themselves. Controller doesn't know about pods, sessions, or Claude Code.
5. An engine is a router and optional scheduler.
