## Context

Ark has three A2A message-send boundaries where platform context is passed:

1. **Controller → Completions Engine** (`executeViaEngine` in `query_controller.go`) — sends a metadata blob with agent config, tools, history, query ref, and target. Only active when completions runs as a separate service; `executeDirectly` calls completions in-process with no A2A boundary.
2. **Completions Engine → Named Execution Engine** (`execution_engine.go`) — serializes agent config, tools, and history into metadata for engines referenced by `ExecutionEngine` CRD.
3. **Completions Engine → A2A Agent** (`a2a_execution.go`) — sends only user input, no Ark metadata forwarded.

All message-send paths use `ark.mckinsey.com/execution-engine` as the metadata key. The contract types are duplicated in Go (`ExecutionEngineMessage`, `AgentConfig`) and Python (`ExecutionEngineRequest`, `AgentConfig`), manually kept in sync.

Named execution engines are built on the Python ark-sdk overlay, which already has K8s client access (`kubernetes_asyncio`) and generated API clients for all Ark CRDs including Queries.

Current library versions: Go `trpc-a2a-go` v0.2.4, Python `a2a-sdk` ≥0.2.12.

## Goals / Non-Goals

**Goals:**
- Single source of truth for the A2A extension contract at `ark/api/extensions/query/v1/schema.json`
- All A2A message-send boundaries use the same QueryRef extension
- Named engines (Python SDK) resolve full execution context from QueryRef via K8s client
- Executor developers have a clear, discoverable path to build engines
- A2A v0.3.0 extension mechanism adopted (AgentExtension in agent cards, X-A2A-Extensions header, metadata keys)

**Non-Goals:**
- Unifying `ExecutionEngine` and `A2AServer` CRDs
- Formalizing the internal agent/tools/history contract (it's removed, derived from QueryRef)
- gRPC or protobuf adoption
- Central extension registry
- Backwards-compatibility shim during migration

## Decisions

### 1. Extension URI uses the public GitHub repo path

**Decision**: `https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1`

**Rationale**: The A2A spec recommends hosting the extension document at the URI. GitHub raw URLs serve the schema directly. Anyone seeing the URI in an agent card can click through to the spec. No custom domain to maintain.

**Alternative**: Custom domain like `https://extensions.ark.mckinsey.com/query/v1` — rejected because it requires DNS/hosting infrastructure for no functional benefit.

### 2. Extension carries only QueryRef, not the full context

**Decision**: The extension metadata contains only `{ "name": string, "namespace": string }`. Receivers resolve agent config, tools, history from the cluster.

**Rationale**: The completions engine already ignores the metadata blob and resolves everything from the Query CRD via K8s client. Named engines (Python SDK) have K8s client access and can do the same. This eliminates the duplicated type definitions — there's nothing to keep in sync beyond two string fields.

**Alternative**: Continue sending the full blob but validate against a schema — rejected because it perpetuates type duplication across Go/Python and the blob is demonstrably unused by the completions engine.

### 3. SDK resolves QueryRef transparently

**Decision**: `executor_app.py` extracts QueryRef from extension metadata, calls K8s API to fetch the Query CRD, and builds `ExecutionEngineRequest` internally. `BaseExecutor.execute_agent()` interface stays unchanged.

**Rationale**: Engine authors should not know or care about the extension mechanism. The SDK owns the resolution. This also means the resolution logic is in one place (the SDK) rather than in each engine implementation.

### 4. Separate URIs per concern

**Decision**: Each extension gets its own URI (e.g., `ext/query/v1`, future `ext/tracing/v1`). Not one monolithic `ext/ark/v1`.

**Rationale**: A2A extensions are composable — engines can declare support for some but not all. Separate URIs enable this. A tracing extension shouldn't require understanding the query extension.

### 5. Coordinated cutover, no backwards compatibility

**Decision**: Go sender and Python receiver update together. No fallback to the old metadata key.

**Rationale**: Both sides are in the same repo, deployed together via devspace. A compatibility shim adds complexity for a transition period of zero — there's no external consumer of the old format that can't be updated simultaneously.

### 6. Library upgrades

**Decision**: Go `trpc-a2a-go` v0.2.4 → v0.2.5. Python `a2a-sdk` ≥0.2.12 → 0.3.x.

- Go v0.2.5: Has `AgentExtension` type and `Message.Extensions` field. Does not handle `X-A2A-Extensions` header automatically — wire it manually.
- Python 0.3.x: Full extension support including header. Breaking change: `camelCase` → `snake_case` field rename across all types.

**Rationale**: Both libraries now have the types needed. The Go header gap is small — a few lines of middleware. The Python migration is mechanical (rename script provided by upstream).

### 7. Agent card declares the extension

**Decision**: Engines built with the SDK declare the query extension in their agent card via `capabilities.extensions`:

```json
{
  "capabilities": {
    "extensions": [{
      "uri": "https://github.com/mckinsey/agents-at-scale-ark/tree/main/ark/api/extensions/query/v1",
      "description": "Ark query context",
      "required": false
    }]
  }
}
```

**Rationale**: This is the A2A-standard way for engines to advertise extension support. The completions engine can check the card before sending the extension. `required: false` means non-Ark A2A clients can still interact with the engine.

## Risks / Trade-offs

**[Extra K8s round-trip for named engines]** → Named engines now make a K8s API call to resolve QueryRef instead of receiving pre-serialized data. Mitigation: LLM execution times dwarf a single API call. SDK can cache if needed.

**[Python a2a-sdk breaking changes]** → The camelCase → snake_case migration touches all overlay code that uses a2a types. Mitigation: Upstream provides a migration script. Changes are mechanical and testable.

**[Go library doesn't handle X-A2A-Extensions header]** → Must wire manually. Mitigation: It's a single HTTP header to set on outbound requests and read on inbound — straightforward middleware.

**[External A2A agents can't resolve QueryRef]** → Pure A2A agents outside the cluster have no K8s access. Mitigation: QueryRef is `required: false`. External agents ignore it and work as before with just the user message. The extension is for traceability, not functional dependency.

## Migration Plan

1. Upgrade Go `trpc-a2a-go` to v0.2.5, Python `a2a-sdk` to 0.3.x
2. Run Python camelCase → snake_case migration across SDK overlay
3. Create `ark/api/extensions/query/v1/schema.json` and `README.md`
4. Add `extensions/query.py` to Python SDK overlay with QueryRef extraction and K8s resolution
5. Update `executor_app.py` to use `extensions/query.py` instead of raw metadata extraction
6. Update `query_controller.go` `executeViaEngine` to send QueryRef extension
7. Update `execution_engine.go` to forward QueryRef extension to named engines
8. Optionally attach QueryRef to A2A agent calls in `a2a_execution.go`
9. Remove old metadata blob construction and parsing code
10. Update docs and add executor developer guide

All changes deploy together via devspace. Rollback: revert the commit.

## Open Questions

- Should the `ExecutorApp` automatically declare the query extension in the agent card, or should engine authors opt in?
- When future extensions are added (tracing, etc.), should the SDK auto-resolve all declared extensions, or require explicit registration per extension?
