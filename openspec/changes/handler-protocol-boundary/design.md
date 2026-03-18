## Context

After Steps 6 and 7, the agent/team orchestration layer and memory interface can produce and consume `protocol.Message`. The handler is the boundary between internal engine logic and the A2A task manager. Currently, `buildA2AResponse` converts OpenAI messages to protocol messages. With protocol messages available internally, the conversion direction should be inverted: protocol is the primary type, with OpenAI serialization only for backward-compatible `response.raw`.

## Goals / Non-Goals

**Goals:**
- `buildA2AResponse` operates on `protocol.Message` as its primary input type
- OpenAI-to-protocol conversion moves to an adapter for legacy execution paths
- `response.raw` generation uses protocol-to-OpenAI serialization at the boundary

**Non-Goals:**
- Removing OpenAI type handling from the handler entirely
- Changing `ExecutionResult` to only carry protocol messages (both paths needed during migration)

## Decisions

### 1. Protocol-first `buildA2AResponse`

**Decision**: Refactor `buildA2AResponse` signature to accept `[]protocol.Message`. When the execution result provides OpenAI-typed messages, an adapter converts them to protocol messages before calling `buildA2AResponse`.

**Rationale**: This makes the protocol path the primary code path. The OpenAI adapter becomes a compatibility shim, clearly separated from the main logic.

### 2. Protocol-to-OpenAI serializer for `response.raw`

**Decision**: Implement `protocolToOpenAIJSON` that serializes `[]protocol.Message` into the OpenAI-compatible JSON format expected by `response.raw`. This replaces the current path where OpenAI messages are directly serialized.

**Rationale**: Since the source of truth is now protocol messages, the handler must be able to produce the legacy format from them. This is the inverse of `openAIToProtocolResponseMessages` and lives in the same file.

### 3. Execution result dual-carry

**Decision**: `ExecutionResult` may carry both `ResponseMessages []Message` (existing) and `ProtocolResponseMessages []protocol.Message` (new). The handler checks for protocol messages first, falling back to OpenAI messages with adapter conversion.

**Rationale**: During migration, some execution paths produce OpenAI messages and others produce protocol messages. The dual-carry pattern avoids forcing all paths to change simultaneously.

### 4. Shared conversion matrix semantics

**Decision**: Handler conversion uses the same required-lossless semantic matrix as memory boundary conversion: role, text parts, DataParts, and extension-scoped attribution are preserved on protocol paths; compatibility-only lossy behavior is explicit.

**Rationale**: Handler and memory boundaries must not preserve different subsets of semantics or downstream parity becomes non-deterministic.

### 5. Native-first extension scope at handler boundary

**Decision**: Handler boundary behavior stays protocol-native first and does not define additional extension contracts for history or callback-loop semantics.

**Rationale**: Those semantics are already covered by core protocol constructs; extra handler-local extension contracts would duplicate semantics and increase compatibility burden.

### 6. Canonical-to-compat mapping policy

**Decision**: Compatibility output fields (including `assistant.name`) are derived from canonical protocol semantics, including extension-scoped attribution where present.

**Rationale**: This keeps provider-specific compatibility output downstream of protocol semantics and avoids reintroducing provider-native source-of-truth behavior.

## Risks

**[Conversion parity]** — The `protocolToOpenAIJSON` serializer must produce output equivalent to what the previous direct-serialization path produced while preserving extension attribution mapping. Mitigation: comparison tests against known-good outputs from the existing path and attribution-aware fixtures.
This mitigates the `Conversion parity` risk using shared fixture matrix and deterministic protocol-to-compat equivalence checks.

**[Result complexity]** — `ExecutionResult` with two message fields increases structural complexity. Mitigation: clearly documented which field takes precedence; the OpenAI field is deprecated once all paths produce protocol messages.
