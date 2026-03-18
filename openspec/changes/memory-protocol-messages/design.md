## Context

The `MemoryInterface` provides message persistence for agent conversations. The HTTP implementation (`memory_http.go`) serializes `[]Message` to JSON for the postgres-memory service. Since the wire format is JSON and the service is schema-agnostic (it stores message blobs), protocol-typed methods can coexist by converting at the serialization boundary.

## Goals / Non-Goals

**Goals:**
- Protocol-typed memory methods that coexist with OpenAI-typed ones
- Conversion happens at the HTTP wire boundary, not in the caller
- Interoperability: messages stored via one method are retrievable via the other

**Non-Goals:**
- Changing the memory service's storage schema
- Removing OpenAI-typed methods from `MemoryInterface`
- Modifying the postgres-memory service

## Decisions

### 1. Interface extension with default methods

**Decision**: Add `AddProtocolMessages` and `GetProtocolMessages` to `MemoryInterface`. Existing implementations must be updated.

**Rationale**: Go interfaces require all methods to be implemented. Since there are only two implementations (`memory_http.go` and `memory_noop.go`), updating both is straightforward.

### 2. Conversion at HTTP boundary

**Decision**: `memory_http.go` converts between `protocol.Message` and the wire JSON format at the serialization point. The wire format itself does not change — it uses the same JSON structure the memory service already stores.

**Rationale**: The memory service stores opaque JSON blobs. Converting at the boundary means the service never needs to understand protocol types. The wire format remains backward-compatible.

### 3. Cross-method interoperability

**Decision**: Messages stored via `AddProtocolMessages` produce valid results from `GetMessages`, and messages stored via `AddMessages` produce valid results from `GetProtocolMessages`. This is guaranteed by converting through the shared wire format.

**Rationale**: During migration, different callers may use different method variants. Interoperability prevents data access gaps.

### 4. Conversion matrix and lossless classes

**Decision**: The memory boundary defines explicit conversion classes: required-lossless semantics (role, text parts, extension attribution, structured DataParts) and compatibility-only lossy semantics for legacy output where unavoidable.

**Rationale**: Cross-method interoperability is not sufficient unless the preserved semantics are explicitly defined and testable across both protocol and compatibility paths.

### 5. Native-first history semantics

**Decision**: History persistence remains modeled by native A2A task/message constructs. This step does not introduce a history-specific extension contract.

**Rationale**: Existing protocol message and context semantics are sufficient for history behavior; new extensions are reserved for proven semantic gaps.

### 6. Minimum extension inventory preservation

**Decision**: Memory conversion matrices explicitly preserve semantics for the canonical extension set (`query/v1`, `team-attribution/v1`) when those payloads are present.

**Rationale**: Narrow inventory and explicit preservation rules keep conversion behavior deterministic across protocol and compatibility paths.

## Risks

**[Conversion loss]** — Protocol messages may contain DataParts or extensions that don't map cleanly to the OpenAI wire format. Mitigation: explicit conversion matrix with required-lossless semantics, plus fixture-based parity tests for protocol and compatibility retrieval paths.
This mitigates the `Conversion loss` risk with shared matrix rules and required-lossless field class.
