## Why

The Ark execution engine contract — how components communicate context across A2A boundaries — is an implicit metadata blob duplicated across Go and Python with no formal spec. Types are manually kept in sync (`ExecutionEngineMessage` in Go, `ExecutionEngineRequest` in Python SDK), the wire format is type-unsafe (`map[string]any`), and executor developers have poor discoverability of the contract.

Ark has three A2A message boundaries today, all using the same informal `ark.mckinsey.com/execution-engine` metadata key but with no unified contract:

1. **Controller → Completions Engine** (`executeViaEngine`) — sends A2A message with metadata blob to remote completions engine. Only used when completions runs as a separate service; otherwise `executeDirectly` calls completions in-process with no A2A boundary.
2. **Completions Engine → Named Execution Engine** — forwards agent config, tools, history as metadata to external engines referenced by `ExecutionEngine` CRD.
3. **Completions Engine → A2A Agent** — sends user input to discovered A2A agents (already minimal, no Ark metadata forwarded).

Additionally, the **A2ATask Controller → A2A Server** path polls task status via `GetTasks` (read-only, no message send).

Each message-send boundary independently constructs and parses the metadata blob. A2A v0.3.0 introduced an extensions mechanism that provides a standard way to carry platform-specific context — Ark should adopt it to unify all message-send boundaries under one contract.

## What Changes

- Define a formal A2A extension (`query/v1`) with a JSON Schema as the single source of truth at `ark/api/extensions/query/v1/`
- Extension URI: `https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1`
- Extension carries only `QueryRef` (`name` + `namespace`) — receivers resolve everything else from the cluster
- **BREAKING**: Replace the `ark.mckinsey.com/execution-engine` metadata blob with the A2A extension metadata key (coordinated cutover, no backwards-compatibility shim)
- Unify all three message-send boundaries (①②③) to use the same QueryRef extension:
  - Controller `executeViaEngine` sends QueryRef instead of full metadata blob
  - Completions engine forwards QueryRef to named execution engines instead of serialized agent/tools/history
  - A2A agents optionally receive QueryRef for traceability (currently get no Ark context)
- Python SDK overlay (used by all named engines) extracts QueryRef from extension metadata and resolves the full execution context via its existing K8s client — `BaseExecutor.execute_agent()` interface unchanged
- Upgrade Go `trpc-a2a-go` v0.2.4 → v0.2.5 for extension type support
- Upgrade Python `a2a-sdk` ≥0.2.12 → 0.3.x for full extension support (camelCase → snake_case migration)

## Capabilities

### New Capabilities
- `a2a-query-extension`: Formal A2A v0.3.0 extension defining how Ark passes query context to execution engines, with JSON Schema spec and SDK resolution support
- `executor-developer-guide`: Documentation and examples for building Ark execution engines, referencing the extension spec

### Modified Capabilities

## Impact

- `ark/internal/controller/query_controller.go` — `executeViaEngine` rewritten to send QueryRef extension instead of metadata blob
- `ark/executors/completions/execution_engine.go` — rewrite metadata construction to forward QueryRef extension to named engines
- `ark/executors/completions/a2a_execution.go` — optionally attach QueryRef extension when calling A2A agents
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/executor_app.py` — replace metadata blob extraction with QueryRef resolution via K8s client
- `lib/ark-sdk/gen_sdk/overlay/python/ark_sdk/extensions/` — new module for extension handling
- `ark/go.mod` — bump trpc-a2a-go dependency
- Python SDK dependencies — bump a2a-sdk, migrate camelCase → snake_case across overlay
- `docs/content/developer-guide/` — new executor guide and extension reference
- All implementation files reference `ark/api/extensions/query/v1/` as authoritative spec
