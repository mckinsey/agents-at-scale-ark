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
