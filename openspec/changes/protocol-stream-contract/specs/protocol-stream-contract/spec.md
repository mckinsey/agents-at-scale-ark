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
- **AND** the content, role, and metadata are equivalent across both events
