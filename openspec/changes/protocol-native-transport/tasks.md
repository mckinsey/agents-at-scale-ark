# Protocol-Native Transport Tasks

## 1. API input normalization

- [ ] 1.1 Add engine-neutral input accessors to `query_types.go` that return `[]protocol.Message` alongside existing `GetInputMessages`/`SetInputMessages`
- [ ] 1.2 Migrate completions `GetQueryInputMessages` to use the new accessors
- [ ] 1.3 Deprecate OpenAI-typed input accessors with doc comments marking them as legacy
- [ ] 1.4 Unit tests for new accessors covering user-text, messages-array, and parameter-ref input types

## 2. Streaming contract split

- [ ] 2.1 Define protocol-native stream event type in `streaming.go`
- [ ] 2.2 Add compatibility adapter converting protocol events to `ChunkWithMetadata` (OpenAI chunk shape)
- [ ] 2.3 Migrate `streamContentChunk` in `a2a_execution.go` to emit protocol events through the adapter
- [ ] 2.4 Unit tests verifying adapter produces identical output to current `ChunkWithMetadata` construction

## 3. Agent/team interfaces on protocol types

- [ ] 3.1 Add protocol-typed `Execute` method to `TeamMember` interface alongside existing OpenAI-typed one
- [ ] 3.2 Add protocol-returning `executeLocally` counterpart; existing method delegates to it with adapter
- [ ] 3.3 Convert `prepareMessages` to build `[]protocol.Message`; adapter converts to OpenAI at model call site only
- [ ] 3.4 Migrate team orchestration (`team.go`, `team_selector.go`, `team_graph.go`) to call protocol-typed interface
- [ ] 3.5 Unit tests for adapter round-trips (protocol -> OpenAI -> protocol preserves content)

## 4. Memory interface migration

- [ ] 4.1 Add `AddProtocolMessages`/`GetProtocolMessages` to `MemoryInterface`
- [ ] 4.2 HTTP memory adapter converts at wire boundary for postgres-memory service
- [ ] 4.3 Noop memory implementation updated
- [ ] 4.4 Migrate agent/team callers from OpenAI memory methods to protocol ones
- [ ] 4.5 Unit tests for HTTP adapter conversion correctness

## 5. Handler boundary inversion

- [ ] 5.1 Add protocol-native entry point to `buildA2AResponse` accepting `[]protocol.Message` directly
- [ ] 5.2 Existing OpenAI entry point delegates to protocol path via conversion
- [ ] 5.3 Legacy `messages` field derived from protocol messages (protocol-to-OpenAI) for backward compat
- [ ] 5.4 Unit tests verifying output contract unchanged for both entry points

## 6. Compatibility lifecycle governance

- [ ] 6.1 Document adapter isolation boundaries: which adapters live where, what they convert, who owns them
- [ ] 6.2 Add mixed-deployment test matrix covering all controller+engine version combinations
- [ ] 6.3 Add parity tests verifying legacy and protocol paths produce identical outputs
- [ ] 6.4 Document retirement criteria for each adapter as separate future work items
