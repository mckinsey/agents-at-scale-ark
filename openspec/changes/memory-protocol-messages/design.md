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

## Risks

**[Conversion loss]** — Protocol messages may contain DataParts or extensions that don't map cleanly to the OpenAI wire format. Mitigation: DataParts are serialized as JSON metadata alongside text content; `GetMessages` callers see the text content and `GetProtocolMessages` callers see the full structured data.
