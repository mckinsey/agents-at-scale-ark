# Protocol Stream Contract Tasks

## 1. Protocol stream event type

- [ ] 1.1 Define `ProtocolStreamEvent` struct in `streaming.go` with content, role, metadata, status, and optional DataParts
- [ ] 1.2 Implement `ProtocolStreamEvent` serialization compatible with existing SSE transport

## 2. Handler-side conversion

- [ ] 2.1 Implement `ChunkWithMetadata`-to-`ProtocolStreamEvent` conversion in handler
- [ ] 2.2 Update stream emission in handler to dual-emit both event types
- [ ] 2.3 Ensure atomic ordering of paired events

## 3. Controller stream consumer

- [ ] 3.1 Update controller stream consumer to detect and prefer `ProtocolStreamEvent`
- [ ] 3.2 Implement fallback to `ChunkWithMetadata` parsing when protocol events are absent
- [ ] 3.3 Remove OpenAI type imports from controller stream path once protocol path is active

## 4. Testing

- [ ] 4.1 Unit tests for `ChunkWithMetadata`-to-`ProtocolStreamEvent` conversion covering text chunks, tool-call chunks, and final chunks
- [ ] 4.2 Integration tests verifying dual-emit produces consistent content across both event types
- [ ] 4.3 Backward-compatibility tests verifying controller works with old-format-only streams
- [ ] 4.4 Run existing streaming e2e tests to verify no regressions

## 5. Pairing and attribution parity

- [ ] 5.1 Add deterministic pair correlation fields for legacy/protocol stream event pairs
- [ ] 5.2 Validate extension-scoped attribution parity across paired events
- [ ] 5.3 Add parity assertions that do not depend on event arrival timing only

## 6. Native-first extension scoping

- [ ] 6.1 Document that stream semantics are native protocol events first, without introducing stream-specific extension contracts for current scope
- [ ] 6.2 Add telemetry assertions for `soft_fail_warn` behavior when attribution extension declaration is missing

## 7. Risk-tracked actions

- [ ] 7.1 Enumerate contract-critical stream consumers (dashboard SSE, broker, CLI) and the chunk fields they parse; add each to parity checklist (risk: Streaming consumer fragility)
