## ADDED Requirements

### Requirement: Protocol-native internal agent and team loops
The completions executor SHALL run agent, team, selector, and graph orchestration with protocol-native message transport internally.

#### Scenario: Execute team turn with protocol history
- **WHEN** a team member executes within sequential, round-robin, selector, or graph strategy
- **THEN** history accumulation and member invocation SHALL use protocol message types end to end

#### Scenario: Preserve provider compatibility boundary
- **WHEN** local model providers are invoked from protocol-native loops
- **THEN** protocol messages SHALL be converted at the provider boundary using the adapter layer and converted back for internal accumulation

### Requirement: Agent produces protocol message sequence
Each agent execution step SHALL produce its own `role=agent` ProtocolMessage with appropriate parts and extension metadata.

#### Scenario: Agent tool call produces DataPart message
- **WHEN** an agent invokes a tool during execution
- **THEN** the tool call SHALL be represented as a ProtocolMessage with a DataPart containing tool call structure

#### Scenario: Agent final answer produces TextPart message
- **WHEN** an agent produces a final text response
- **THEN** the response SHALL be a ProtocolMessage with a TextPart

### Requirement: Selector reads extension metadata for agent identity
The team selector SHALL read agent identity from execution-trace extension metadata rather than bare metadata keys.

#### Scenario: Selector history labels from extension metadata
- **WHEN** the selector builds prompt history from accumulated messages
- **THEN** agent identity SHALL be read from the execution-trace extension metadata on each message
- **AND** the label SHALL fall back to `assistant` when metadata is absent
