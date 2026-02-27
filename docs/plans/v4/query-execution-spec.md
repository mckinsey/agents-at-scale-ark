# Modular Query Execution

## Core Model

An execution engine is a service that runs queries. The ExecutionEngine CRD is a named pointer — it stores an address (the controller itself, a K8s Service, or an external URL). The query reconciler just picks the right engine based on labels or whatever logic, resolves the address and sends queries via A2A. What runs behind the address is the engine's business.

Everything is an execution engine. A2A is the message format. If you want to build an engine that can schedule, can have workspace/PVC logic, can handle extra agent fields or annotations that's fine. Out of the box ark handles stateless v1 completions with engine embedded in ark system controller, you can deploy per namespace if you prefer, or deploy a claude engine, or even later a claude scheduling engine. The query goes to the engine based on the query labels/annotations or the agent spec.

## Example Three Levels

### 1. In-Process (Ark Execution Engine)

Default `ExecutionEngine` in `ark-system`, points to the controller itself.

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
- We can consider workspaces later, but basically they'd attach as PVCs and the engine has to best effort isolate

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
- We can do more with workspaces now, per session or per agent mount into pods

## Ark Tools from External Engines

Engines manage their own tools — Claude Code has Bash, Read, Write, etc. But external engines can also use Ark-managed tools (MCP servers, Tool CRDs) via two paths:

1. **`input-required` callback** (Drew's proposal) — the engine pauses via A2A `input-required` state, asks the controller to execute a tool, controller runs it via ToolRegistry and sends the result back. Engine stays in control of the agent loop, controller stays in control of tool execution.
2. **Direct MCP connection** — the engine connects to Ark MCP servers over the network. No controller involvement. The engine adds Ark MCP as a tool source alongside its own tools.

Both are additive. An engine can host its own tools AND call Ark tools. The controller's ToolRegistry becomes a tool source that engines can opt into, not a bottleneck.

## ExecutionEngine CRD

One new field: **`spec.config`** (`map[string]string`) passed to the engine via A2A metadata. Controller does not interpret it. Agents override via annotations (`executors.ark.mckinsey.com/<engine>.<key>`).

## Principles

1. The CRD points to a service. Customised with annotations and config.
2. The service is A2A. It receives the agent/team and can read annotations.
3. Engines can reject queries they can't execute.
4. Engines manage themselves. Controller doesn't know about pods, sessions, or Claude Code.
5. An engine is a router and optional scheduler.
6. Engines can use Ark tools via `input-required` or direct MCP — they don't have to, but the path exists.
