## Context

The completions engine uses `completions.Message` (an alias for `openai.ChatCompletionMessageParamUnion`) as its internal message type. This type flows through:

1. **Agent execution** — `executeLocally` returns `[]Message`, `prepareMessages` builds `[]Message`
2. **Team orchestration** — `TeamMember.Execute` typed on `[]Message`, history accumulated as `[]Message`
3. **Memory** — `MemoryInterface.AddMessages`/`GetMessages` typed on `[]Message`
4. **Streaming** — `ChunkWithMetadata` wraps OpenAI chunk shape
5. **Handler response** — `openAIToProtocolResponseMessages` converts from OpenAI to protocol as final step

The controller is already decoupled: input uses a shared resolver (#1396), response passes through executor-produced content opaquely (#1379). The remaining work is inside the engine boundary.

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

**Alternative**: In-place replacement with coordinated cutover — rejected because it creates large, hard-to-review PRs and risks regressions.

### 2. Conversion at model call site only

**Decision**: OpenAI types are constructed only where the engine calls the LLM provider API. All internal accumulation, routing, and storage uses `protocol.Message`.

**Rationale**: Confines provider coupling to one location per execution path. Adding a non-OpenAI provider requires implementing only the model call conversion.

### 3. Adapters are long-lived

**Decision**: Compatibility adapters (protocol-to-OpenAI for legacy consumers, OpenAI-to-protocol for legacy producers) are maintained indefinitely. Removal requires adoption evidence.

**Rationale**: Mixed deployments, external SDK consumers, and the postgres-memory service may depend on legacy shapes for an extended period. Treating adapters as temporary creates pressure to remove them before consumers are ready.

### 4. Memory converts at HTTP wire boundary

**Decision**: The `MemoryInterface` internal contract uses `protocol.Message`. The HTTP memory adapter converts to/from OpenAI shapes at the HTTP boundary for the postgres-memory service.

**Rationale**: The postgres-memory service stores JSON blobs — it doesn't parse message structure. The adapter converts at serialization time without changing the storage service.

### 5. Streaming uses protocol events with adapter

**Decision**: A new protocol-native stream event type is defined. `ChunkWithMetadata` remains as a compatibility adapter that converts protocol events to OpenAI chunk shape for existing consumers (dashboard SSE, broker).

**Rationale**: Dashboard and broker parse specific OpenAI chunk fields. The adapter isolates this dependency. New streaming consumers can use protocol events directly.

### 6. Handler inversion accepts both input shapes

**Decision**: `buildA2AResponse` gains a protocol-native entry point. The existing OpenAI entry point delegates to it via conversion. During transition, either works.

**Rationale**: Migrated callers (agent, team) use the protocol entry point. Unmigrated callers still work through OpenAI entry point. Output contract unchanged.

## Sequencing

Steps must merge in this order due to dependencies:

```
Step 1 (API input normalization) — no dependencies on other steps
Step 2 (Streaming contract split) — no dependencies on other steps
Step 3 (Agent/team interfaces) — depends on step 1 for input types
Step 4 (Memory interface) — depends on step 3 for protocol message producers
Step 5 (Handler boundary inversion) — depends on steps 3 and 4 for protocol message flow
Step 6 (Compatibility governance) — ongoing, parallel to all steps
```

Steps 1 and 2 can proceed in parallel. Steps 3–5 are sequential.

## Risks / Trade-offs

**[Protocol message expressiveness]** — `protocol.Message` may lack fields needed for internal state (e.g., assistant identity in team history). Mitigation: use `Message.Metadata` for internal annotations, consistent with existing team history approach.

**[Memory service wire format]** — Changing what the HTTP adapter serializes could break stored conversations. Mitigation: adapter produces the same JSON shape the service expects today. No storage migration needed.

**[Streaming consumer fragility]** — Dashboard and broker may depend on undocumented OpenAI chunk fields. Mitigation: adapter produces the exact same chunk shape. New consumers use protocol events.

**[Test coverage gaps]** — Adapter correctness is critical. Mitigation: each step requires unit tests for adapter round-trips (protocol -> OpenAI -> protocol preserves content).
