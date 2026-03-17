## ADDED Requirements

### Requirement: Protocol-typed team member interface
The completions engine SHALL provide a `ProtocolTeamMember` interface that operates on `protocol.Message` types.

#### Scenario: Agent implements ProtocolTeamMember
- **WHEN** an agent implements `ProtocolTeamMember.Execute`
- **THEN** it receives `protocol.Message` inputs and returns `[]protocol.Message` results
- **AND** the internal OpenAI API call path converts at the provider boundary only

#### Scenario: Mixed interface team execution
- **WHEN** a team contains members implementing different interfaces (`TeamMember` and `ProtocolTeamMember`)
- **THEN** the team dispatcher calls each member through the appropriate interface
- **AND** adapter conversion preserves message content fidelity across the boundary

### Requirement: Bidirectional message adapters
Adapters SHALL convert between `Message` (OpenAI-typed) and `protocol.Message` with full content fidelity.

#### Scenario: OpenAI to protocol message conversion
- **WHEN** a `Message` with role, text content, and tool calls is converted to `protocol.Message`
- **THEN** the role is preserved, text content maps to TextPart, and tool calls map to DataParts
- **AND** converting back produces an equivalent `Message`

#### Scenario: Protocol to OpenAI message conversion
- **WHEN** a `protocol.Message` with TextParts and DataParts is converted to `Message`
- **THEN** TextParts map to text content, DataParts with tool-call data map to tool calls
- **AND** converting back produces an equivalent `protocol.Message`

## MODIFIED Requirements

### Requirement: Team orchestration dispatch
Team orchestration SHALL support members implementing either `TeamMember` or `ProtocolTeamMember`.

#### Scenario: Dispatcher prefers protocol interface
- **WHEN** a team member implements both `TeamMember` and `ProtocolTeamMember`
- **THEN** the dispatcher calls `ProtocolTeamMember.Execute`
