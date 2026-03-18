## ADDED Requirements

### Requirement: Protocol-native stream event type
The streaming path SHALL support a protocol-native event type that carries A2A content without requiring OpenAI types.

#### Scenario: Executor emits protocol stream event
- **WHEN** the completions handler processes a `ChunkWithMetadata` from the engine
- **THEN** it also emits a `ProtocolStreamEvent` containing equivalent A2A-typed content
- **AND** both events are emitted in deterministic order

#### Scenario: Controller consumes protocol stream events
- **WHEN** the controller's stream consumer receives a `ProtocolStreamEvent`
- **THEN** it processes the event without importing or referencing OpenAI types
- **AND** the resulting status update matches what would be produced from the equivalent `ChunkWithMetadata`

### Requirement: Backward-compatible stream consumption
The controller SHALL fall back to `ChunkWithMetadata` processing when protocol-native events are not available.

#### Scenario: Legacy executor without protocol events
- **WHEN** the controller receives stream events from an executor that only emits `ChunkWithMetadata`
- **THEN** the controller processes them using the existing parsing path
- **AND** no errors or degraded behavior occurs

### Requirement: Dual-emit at engine boundary
The completions handler SHALL emit both `ChunkWithMetadata` and `ProtocolStreamEvent` for each stream chunk during the migration period.

#### Scenario: Both event types emitted per chunk
- **WHEN** the engine produces a streaming chunk
- **THEN** the handler emits both a `ChunkWithMetadata` and a corresponding `ProtocolStreamEvent`
- **AND** the content, role, and extension-scoped attribution semantics are equivalent across both events

### Requirement: Deterministic stream event pairing
Dual-emitted stream events SHALL include deterministic correlation for parity verification.
This requirement mitigates the `Event ordering` risk.

#### Scenario: Correlate paired legacy and protocol events
- **WHEN** a pair of events is emitted for a single source chunk
- **THEN** both events include the same pairing identifier or sequence metadata
- **AND** test and consumer logic can verify one-to-one semantic equivalence without relying on arrival timing alone

### Requirement: Native-first stream extension scope
Streaming semantics SHALL use protocol-native event structure before introducing additional extension contracts.

#### Scenario: Evaluate stream semantic gap
- **WHEN** stream parity requirements are reviewed
- **THEN** protocol event fields plus existing extension attribution are evaluated first
- **AND** no new stream-specific extension is introduced unless an unresolved semantic gap is documented

#### Scenario: Attribution declaration mismatch during stream handling
- **WHEN** stream parity expects attribution semantics and target capability declaration is missing
- **THEN** the system records `soft_fail_warn` telemetry for the missing extension declaration
- **AND** stream processing continues through compatibility output paths
