## ADDED Requirements

### Requirement: Protocol-native handler execution state
The handler SHALL keep execution state (inputs, history, responses) in protocol-native message form with OpenAI conversion only at provider and serialization boundaries.

#### Scenario: Handler dispatch lifecycle
- **WHEN** the handler dispatches execution to agent, team, model, or tool targets
- **THEN** inputs, history, and responses SHALL remain protocol-native until boundary serialization

#### Scenario: Handler model dispatch converts at boundary
- **WHEN** the handler invokes a direct model execution
- **THEN** protocol messages SHALL be converted to OpenAI at the model call boundary and converted back afterward

### Requirement: Controller serialization uses protocol-native extraction
The controller SHALL use protocol-native response data as the primary source for `response.raw` serialization.

#### Scenario: Controller success response from protocol-native field
- **WHEN** the controller processes a successful execution result
- **THEN** the controller SHALL extract `responseMessagesV1` as the primary source for serialization

### Requirement: Streaming maps protocol messages to A2A events
The streaming path SHALL map ProtocolMessages to A2A streaming events without intermediate OpenAI conversion.

#### Scenario: Protocol message maps to streaming event
- **WHEN** a ProtocolMessage is produced during streaming execution
- **THEN** the message SHALL map directly to a TaskStatusUpdateEvent or TaskArtifactUpdateEvent
