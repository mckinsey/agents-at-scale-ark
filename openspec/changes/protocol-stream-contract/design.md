## Context

Streaming events flow from the completions engine through the A2A task manager to the controller. Currently, `ChunkWithMetadata` wraps `openai.ChatCompletionChunk` — an OpenAI-specific type. The controller must import or understand this type to process streamed content. A protocol-native event type allows the controller to consume streams without provider-specific knowledge.

## Goals / Non-Goals

**Goals:**
- Protocol-native stream event type that carries text content, metadata, and status without OpenAI types
- Dual-emit at the engine boundary so both legacy and protocol consumers work
- Controller stream consumer can prefer protocol-native events

**Non-Goals:**
- Removing `ChunkWithMetadata` from the engine's internal streaming path
- Changing the underlying transport (SSE) protocol
- Supporting arbitrary binary stream payloads

## Decisions

### 1. `ProtocolStreamEvent` type

**Decision**: Define a new struct containing A2A-typed fields: content text, role, metadata map, completion status, and optional DataParts for structured content.

**Rationale**: Mirrors the information in `ChunkWithMetadata` but expressed in protocol terms. The controller can consume this without knowing about `openai.ChatCompletionChunk` fields.

### 2. Dual-emit at handler boundary

**Decision**: The completions handler converts each `ChunkWithMetadata` to a `ProtocolStreamEvent` and emits both to the event stream. The conversion happens in the handler, not in `a2a_execution.go`.

**Rationale**: `a2a_execution.go` works with OpenAI types internally (it calls the OpenAI API). The handler is the natural boundary where protocol translation occurs. Dual-emit preserves backward compatibility.

### 3. Stream consumer fallback

**Decision**: The controller's stream consumer checks for `ProtocolStreamEvent` first, falling back to parsing `ChunkWithMetadata` if not present.

**Rationale**: Allows gradual rollout. Old executors that only emit `ChunkWithMetadata` continue to work. New executors provide richer protocol-native data.

### 4. Deterministic pair correlation

**Decision**: Dual-emitted legacy/protocol events include deterministic pairing metadata (for example, sequence or pair index) so parity checks are unambiguous.

**Rationale**: Synchronous emit order alone is not sufficient for robust verification in distributed consumers and test harnesses.
This mitigates the `Event ordering` risk with pair-correlation requirement and parity assertions.

### 5. Native-first stream semantics

**Decision**: Streaming uses protocol-native events as the primary semantic carrier. No dedicated stream extension is introduced unless a concrete semantic gap remains after applying core event fields plus existing attribution extension semantics.

**Rationale**: Stream behavior can be expressed via protocol event structure and deterministic pairing; adding extra extension contracts without demonstrated need increases migration surface.

### 6. Capability verification observability for attribution parity

**Decision**: When stream parity relies on team attribution semantics, missing attribution extension declarations are recorded via `soft_fail_warn` telemetry and processing continues on compatibility output.

**Rationale**: This preserves mixed-deployment behavior while making declaration drift measurable for later enforcement decisions.

## Risks

**[Event ordering]** — Dual-emit could introduce ordering issues if events are not atomically paired. Mitigation: both events are emitted synchronously in sequence for each chunk and carry deterministic pair correlation metadata.

**[Bandwidth overhead]** — Emitting two event types doubles stream volume. Mitigation: once all consumers support protocol events, `ChunkWithMetadata` emission can be gated behind a compatibility flag.
