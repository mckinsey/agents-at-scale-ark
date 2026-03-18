## Context

The completions engine uses `completions.Message` (an alias for `openai.ChatCompletionMessageParamUnion`) as its internal message type. This type flows through:

1. **Agent execution** — `executeLocally` returns `[]Message`, `prepareMessages` builds `[]Message`
2. **Team orchestration** — `TeamMember.Execute` typed on `[]Message`, history accumulated as `[]Message`
3. **Memory** — `MemoryInterface.AddMessages`/`GetMessages` typed on `[]Message`
4. **Streaming** — `ChunkWithMetadata` wraps OpenAI chunk shape
5. **Handler response** — `openAIToProtocolResponseMessages` converts from OpenAI to protocol as final step

The controller is already decoupled: input uses a shared resolver and response passes through executor-produced content opaquely. The remaining work is inside the engine boundary.

## Goals / Non-Goals

**Goals:**
- `protocol.Message` as the canonical in-memory message type for agent loops, team orchestration, memory, and streaming
- OpenAI type conversion confined to two boundaries: model call site (outbound to LLM) and compatibility adapters (outbound to legacy consumers)
- Each step independently mergeable to `main` without breaking existing behavior
- Compatibility adapters well-isolated, documented, and tested

**Non-Goals:**
- Removing the `completions.Message` type alias (deferred to compatibility retirement)
- Changing the wire format between controller and engine (already A2A)
- Modifying external consumer APIs (dashboard, CLI)

## Decisions

### 1. Add-alongside pattern for every interface change

**Decision**: New protocol-typed methods are added alongside existing OpenAI-typed methods. Existing methods delegate to the new ones with an adapter. Callers migrate incrementally.

**Rationale**: Each step is non-breaking. A half-migrated codebase compiles and passes all tests at every commit.

**Alternative**: In-place replacement with coordinated cutover — rejected because it creates large, hard-to-review changes and risks regressions.

### 2. Conversion at model call site only

**Decision**: OpenAI types are constructed only where the engine calls the LLM provider API. All internal accumulation, routing, and storage uses `protocol.Message`.

**Rationale**: Confines provider coupling to one location per execution path. Adding a non-OpenAI provider requires implementing only the model call conversion.

### 3. Adapters are long-lived

**Decision**: Compatibility adapters (protocol-to-OpenAI for legacy consumers, OpenAI-to-protocol for legacy producers) are maintained indefinitely. Removal requires adoption evidence.

**Rationale**: Mixed deployments, external SDK consumers, and the postgres-memory service may depend on legacy shapes for an extended period. Treating adapters as temporary creates pressure to remove them before consumers are ready.

### 4. Memory converts at HTTP wire boundary

**Decision**: The `MemoryInterface` internal contract uses `protocol.Message`. The HTTP memory adapter converts to/from OpenAI shapes at the HTTP boundary for the postgres-memory service.

**Rationale**: The postgres-memory service stores JSON blobs — it doesn't parse message structure. The adapter converts at serialization time without changing the storage service.

### 5. Streaming uses protocol events with handler-side conversion

**Decision**: A new `ProtocolStreamEvent` type is defined. The handler converts `ChunkWithMetadata` (OpenAI chunk shape) to `ProtocolStreamEvent` and dual-emits both event types. The controller prefers protocol events when available, with fallback to legacy parsing. `ChunkWithMetadata` remains as the compatibility path for existing consumers (dashboard SSE, broker).

**Rationale**: Handler-side conversion follows the add-alongside migration pattern (Decision 1). The handler already owns the boundary between engine internals and protocol output. Dual-emit with deterministic pair-correlation provides incremental migration without requiring engine-level changes first. See `protocol-stream-contract` change set for full design and tasks.

### 6. Handler inversion accepts both input shapes

**Decision**: `buildA2AResponse` gains a protocol-native entry point. The existing OpenAI entry point delegates to it via conversion. During transition, either works.

**Rationale**: Migrated callers (agent, team) use the protocol entry point. Unmigrated callers still work through OpenAI entry point. Output contract unchanged.

### 7. Turn attribution follows extension semantics

**Decision**: Turn role remains in `Message.role`. Team/member attribution is represented as extension-scoped semantics (URI + schema-defined payload), not undocumented metadata conventions.

**Rationale**: A2A core role semantics are intentionally narrow (`user`/`agent`). Team identity is custom semantics and must be explicit, namespaced, and adapter-safe across protocol/OpenAI paths.

### 8. Native-first extension admission

**Decision**: Extension usage follows a native-A2A-first filter. Teams, history, and callback loop semantics use core A2A role/parts/task constructs first; extension payloads are added only for residual Ark semantics.

**Rationale**: This keeps protocol contracts portable across engines and avoids rebuilding provider-specific semantics as hidden extension metadata.

### 9. Minimum extension inventory and capability verification

**Decision**: The canonical extension set is `query/v1` plus `team-attribution/v1`. Controller-side dispatch verifies extension declarations via discovered Agent Card capabilities and applies `soft_fail_warn` when declarations are missing.

**Rationale**: Narrow extension scope reduces contract fragmentation while capability verification provides observability and migration safety without hard-failing mixed deployments.

### 10. Extension isolation as foundation pre-step

**Decision**: Before other steps, extension packages are refactored into self-contained, isolated packages behind a common `Extension` interface and central `Registry`. Subsequent steps depend on the registry being available for extension-aware dispatch and capability verification. The package location is an open design question evaluated during Step 1 implementation.

**Rationale**: The add-alongside migration pattern (Decision 1) requires extension URIs, metadata keys, and validation logic to be referenceable without importing engine internals. Isolated packages also enable external extension support and independent versioning required by the capability verification contract (Decision 9).
See `extension-isolation-architecture` change set for full design and tasks.

## Sequencing

Steps must merge in this order due to dependencies:

```
Step 1 (Extension isolation)       — foundation pre-step, no behavioral change
Step 2 (Controller input)          — depends on Step 1
Step 3 (Controller response)       — depends on Step 1
Step 4 (Query input API)           — depends on Steps 1, 2
Step 5 (Protocol stream contract)  — depends on Step 1
Step 6 (Agent/team interfaces)     — depends on Steps 1, 2, 4
Step 7 (Memory interface)          — depends on Step 6
Step 8 (Handler boundary)          — depends on Steps 6, 7
Step 9 (Compatibility governance)  — ongoing, parallel to all steps
```

Step 1 merges first. Steps 2 and 3 can proceed in parallel after Step 1. Steps 4 and 5 can proceed in parallel after Steps 2/3. Steps 6, 7, 8 are sequential. Step 9 is ongoing.

Implementation tasks live in child change sets; see `protocol-native-transport/tasks.md` for the stage-to-change-set mapping.

Dependency order is a promotion guardrail — upstream steps must be satisfied before downstream steps merge.

## Risks / Trade-offs

**[Protocol message expressiveness]** — `protocol.Message` may lack fields needed for internal state (e.g., assistant identity in team history). Mitigation: define extension-scoped attribution payload and mapping rules; keep OpenAI `assistant.name` as compatibility output only. Canonical attribution uses `team-attribution/v1`.

**[Memory service wire format]** — Changing what the HTTP adapter serializes could break stored conversations. Mitigation: adapter produces the same JSON shape the service expects today. No storage migration needed.

**[Streaming consumer fragility]** — Dashboard and broker may depend on undocumented OpenAI chunk fields. Mitigation: adapter produces the exact same chunk shape. New consumers use protocol events.

**[Test coverage gaps]** — Adapter correctness is critical. Mitigation: each step requires unit tests for adapter round-trips (protocol -> OpenAI -> protocol preserves content).
