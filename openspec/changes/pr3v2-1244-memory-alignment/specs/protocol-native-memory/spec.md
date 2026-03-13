## ADDED Requirements

### Requirement: Protocol-native memory interface
The memory interface SHALL accept and return `[]ProtocolMessage`, preserving DataParts and extension metadata through the store/retrieve cycle.

#### Scenario: Store protocol messages with DataParts
- **WHEN** messages containing DataParts (tool calls, tool results) are stored via `AddMessages`
- **THEN** the DataPart structure SHALL be preserved when retrieved via `GetMessages`

#### Scenario: Store protocol messages with extension metadata
- **WHEN** messages containing execution-trace extension metadata are stored
- **THEN** the extension metadata SHALL be preserved when retrieved

### Requirement: HTTP memory boundary conversion
The HTTP memory implementation SHALL convert between protocol messages and the HTTP service payload format at the transport boundary only.

#### Scenario: Add messages converts at HTTP boundary
- **WHEN** protocol messages are sent to the memory HTTP service
- **THEN** the implementation SHALL convert to the HTTP payload format for the wire and convert back on retrieval

#### Scenario: Get messages returns protocol-native format
- **WHEN** the handler retrieves messages from HTTP memory
- **THEN** the result SHALL be `[]ProtocolMessage` regardless of the wire format
