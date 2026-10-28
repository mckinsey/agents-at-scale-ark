# ark-runner

Config-driven PID-1 runner for Agent Substrate actors. One image runs any framework —
the framework is chosen by config (`ARK_FRAMEWORK`, default `completions`), not by baking
a separate image per framework the way AX does.

`ark-substrate-executor` launches this image as a Substrate actor, passing the agent spec
via env. The runner honors the Substrate runner contract (serves `/healthz` and `/readyz`
on :80, stays up as PID-1 until terminated), runs the agent once through the selected
framework adapter, and writes the result to the workspace for the executor to collect.

## Contract

- `/healthz` → 200 once the process is alive.
- `/readyz` → 503 until the agent run finishes, then 200.
- Stays running after the run so the executor can collect the result and `ax ssh` works.

## Config (env)

| Var | Meaning | Default |
| --- | --- | --- |
| `ARK_AGENT_REQUEST` | JSON `ExecutionEngineRequest` (agent, model, userInput, mcpServers) | required |
| `ARK_FRAMEWORK` | adapter selector | `completions` |
| `ARK_RESULT_PATH` | where the result is written | `/workspace/.ark-result.json` |
| `ARK_WORKSPACE` | workspace root | `/workspace` |
| `PORT` | probe server port | `80` |

## Adapters

Selected by `ARK_FRAMEWORK` via `adapters.select()`:

- `completions` (default) — prompt + provider-agnostic model client (`model_client.py`,
  mirrors Ark's Go dispatch: OpenAI/Azure/Anthropic) with an MCP tool-calling loop
  (`mcp_client.py`). Intermediate output is emitted as `__ARK_EVENT__` stdout lines that the
  executor relays to `ark-broker`; the final result is an `__ARK_RESULT__` line.
- `langchain`, `claude` — registered stubs (task 3.2) that raise `NotImplementedError`.

See `openspec/changes/substrate-execution-backend` (`specs/substrate-agent-runner`).
