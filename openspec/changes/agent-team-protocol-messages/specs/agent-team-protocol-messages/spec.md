## ADDED Requirements

### Requirement: Protocol-typed team member interface
The completions engine SHALL provide a `ProtocolTeamMember` interface that operates on `protocol.Message` types.

#### Scenario: Agent implements ProtocolTeamMember
- **WHEN** an agent implements `ProtocolTeamMember.Execute`
- **THEN** it receives `protocol.Message` inputs and returns `(*ExecutionResult, error)`
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

### Requirement: Team member attribution semantics
Team/member attribution SHALL be represented as extension-scoped semantics with a stable schema.
This requirement mitigates the `Team member identity semantics` risk.

#### Scenario: Team member produces assistant turn
- **WHEN** a team member emits an assistant turn in protocol history
- **THEN** the message carries attribution payload under the configured extension schema
- **AND** the message declares the extension URI in `extensions`

#### Scenario: Compatibility path uses OpenAI output
- **WHEN** protocol messages are converted to OpenAI messages for compatibility consumers
- **THEN** attribution semantics map to OpenAI `assistant.name`
- **AND** converting back restores equivalent attribution semantics in protocol form

### Requirement: Native-first capability scope
Team orchestration SHALL keep non-attribution semantics native to A2A unless a specific gap is proven.

#### Scenario: History semantics in team loops
- **WHEN** team history is accumulated across turns
- **THEN** history semantics are represented with native protocol messages and task context
- **AND** no additional history-specific extension is required for current scope

#### Scenario: Attribution capability declaration missing
- **WHEN** dispatch targets a team path that expects `team-attribution/v1` but Agent Card declaration is absent
- **THEN** capability verification records structured warning telemetry
- **AND** dispatch continues under `soft_fail_warn` policy

## MODIFIED Requirements

### Requirement: Team orchestration dispatch
Team orchestration SHALL support members implementing either `TeamMember` or `ProtocolTeamMember`.

#### Scenario: Dispatcher prefers protocol interface
- **WHEN** a team member implements both `TeamMember` and `ProtocolTeamMember`
- **THEN** the dispatcher calls `ProtocolTeamMember.Execute`
