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

## Tools

Three ways an engine gets tools:

1. **Call out to Ark tools** — the engine uses A2A `input-required` to ask the controller to execute an Ark-managed tool (MCP servers, Tool CRDs). This is what the Ark completions engine does today. Drew's proposal formalises this as the standard callback pattern.
2. **Embedded tools** — the engine has its own tools built in. Claude Code has Bash, Read, Write, etc. These don't involve the controller at all.
3. **Agent annotations** — an agent specifies additional tools via annotations that the engine reads. E.g., a Responses API engine might pick up a Responses-specific tool from an annotation that other engines would ignore.

All three compose. An engine can call Ark tools, embed its own, and read agent annotations for extras.

## ExecutionEngine CRD

One new field: **`spec.config`** (`map[string]string`) passed to the engine via A2A metadata. Controller does not interpret it. Agents override via annotations (`executors.ark.mckinsey.com/<engine>.<key>`).

## Principles

1. The CRD points to a service. Customised with annotations and config.
2. The service is A2A. It receives the agent/team and can read annotations.
3. Engines can reject queries they can't execute.
4. Engines manage themselves. Controller doesn't know about pods, sessions, or Claude Code.
5. An engine is a router and optional scheduler.
6. Tools come from three sources: Ark callbacks, embedded in the engine, or agent annotations.
