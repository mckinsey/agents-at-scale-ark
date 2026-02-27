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

Tools work as they do now — but any engine, even non-Ark-native, can use Ark tools. Three sources:

1. **Ark tools via `input-required`** — the engine calls back to the controller to execute Ark-managed tools (MCP servers, Tool CRDs). This is what the completions engine does today. Any external engine can do the same — Drew's proposal formalises this as the standard A2A callback.
2. **Embedded tools** — the engine has its own tools built in. Claude Code has Bash, Read, Write. These don't involve the controller.
3. **Engine-specific tools via agent annotations** — an agent declares additional tools the engine should configure. E.g., the Responses API supports context-free grammars. An agent targeting the Responses engine could carry `ark.mckinsey.com/engine.tool: {CFG tool definition}` and the engine configures that tool. Other engines ignore it.

All three compose. A Claude engine can call Ark MCP tools via `input-required`, use its own embedded tools, and read agent annotations for extras — all in the same query.

## Engine Capabilities

Engines use annotations on the ExecutionEngine CR to declare what they support — e.g., whether they respect MCP servers, whether they support streaming, what tool modes they handle. The controller and dashboard can read these to surface compatibility information to users.

## Observability

Container logs are visible in Ark. Engines must emit OTEL traces and send to the broker, so all engines — Ark-native or external — report through the same observability channel.

## ExecutionEngine CRD

One new field: **`spec.config`** (`map[string]string`) passed to the engine via A2A metadata. Controller does not interpret it. Agents override via annotations (`executors.ark.mckinsey.com/<engine>.<key>`).

## Principles

1. The CRD points to a service. Customised with annotations and config.
2. The service is A2A. It receives the agent/team and can read annotations.
3. Engines can reject queries they can't execute.
4. Engines manage themselves. Controller doesn't know about pods, sessions, or Claude Code.
5. An engine is a router and optional scheduler.
6. Tools come from three sources: Ark callbacks, embedded in the engine, or agent annotations.
