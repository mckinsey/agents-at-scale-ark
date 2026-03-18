## MODIFIED Requirements

### Requirement: Protocol-typed memory interface
`MemoryInterface` SHALL provide protocol-typed methods for message storage and retrieval alongside the existing OpenAI-typed methods.

#### Scenario: Store protocol messages
- **WHEN** `AddProtocolMessages` is called with `[]protocol.Message`
- **THEN** the messages are serialized to the existing wire JSON format
- **AND** the messages are retrievable via both `GetProtocolMessages` and `GetMessages`

#### Scenario: Retrieve as protocol messages
- **WHEN** `GetProtocolMessages` is called
- **THEN** stored messages are returned as `[]protocol.Message`
- **AND** DataParts, extensions, and text content are preserved
- **AND** extension-scoped team/member attribution semantics are preserved

### Requirement: Cross-method interoperability
Messages stored via either method set SHALL be retrievable via the other method set.

#### Scenario: Store via OpenAI, retrieve via protocol
- **WHEN** messages are stored via `AddMessages` (OpenAI-typed)
- **THEN** `GetProtocolMessages` returns equivalent `protocol.Message` objects
- **AND** text content and roles are preserved

#### Scenario: Store via protocol, retrieve via OpenAI
- **WHEN** messages are stored via `AddProtocolMessages`
- **THEN** `GetMessages` returns equivalent `Message` (OpenAI-typed) objects
- **AND** text content and roles are preserved

### Requirement: No-op memory compatibility
The no-op memory implementation SHALL satisfy the extended interface without behavioral changes.

#### Scenario: No-op protocol methods
- **WHEN** `AddProtocolMessages` is called on the no-op implementation
- **THEN** it returns nil without error
- **AND** `GetProtocolMessages` returns an empty slice

### Requirement: Explicit conversion fidelity classes
Memory conversion rules SHALL distinguish required-lossless semantics from compatibility-only lossy semantics.
This requirement mitigates the `Conversion loss` risk.

#### Scenario: Validate conversion matrix behavior
- **WHEN** protocol messages cross the memory HTTP wire boundary
- **THEN** required-lossless fields (role, text parts, DataParts, extension attribution) round-trip without semantic loss
- **AND** any compatibility-only lossy behavior is documented and tested explicitly

### Requirement: Native-first history scope
History persistence semantics SHALL remain native A2A unless a new semantic gap is documented.

#### Scenario: Persist history without history-specific extension
- **WHEN** conversation history is persisted and restored through memory interfaces
- **THEN** protocol messages and task context semantics remain the canonical representation
- **AND** no dedicated history extension contract is required for current scope

#### Scenario: Preserve minimum extension inventory payloads
- **WHEN** memory operations encounter `query/v1` or `team-attribution/v1` payloads
- **THEN** conversion preserves their schema-defined semantics per required-lossless matrix rules
