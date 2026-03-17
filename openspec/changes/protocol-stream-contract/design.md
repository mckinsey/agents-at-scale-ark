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

## Risks

**[Event ordering]** — Dual-emit could introduce ordering issues if events are not atomically paired. Mitigation: both events are emitted synchronously in sequence for each chunk.

**[Bandwidth overhead]** — Emitting two event types doubles stream volume. Mitigation: once all consumers support protocol events, `ChunkWithMetadata` emission can be gated behind a compatibility flag.
