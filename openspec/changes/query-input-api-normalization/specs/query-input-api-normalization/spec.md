## ADDED Requirements

### Requirement: Protocol-typed input message accessors
`QuerySpec` SHALL provide protocol-typed accessors for reading and writing input messages alongside the existing OpenAI-typed accessors.

#### Scenario: Read input as protocol messages
- **WHEN** a query has input messages stored as raw JSON
- **THEN** `GetProtocolInputMessages` returns `[]protocol.Message` with equivalent content to `GetInputMessages`
- **AND** text content, roles, tool calls (as DataParts), and tool results are preserved

#### Scenario: Write input as protocol messages
- **WHEN** `SetProtocolInputMessages` is called with `[]protocol.Message`
- **THEN** the stored raw JSON is readable by both `GetProtocolInputMessages` and `GetInputMessages`

#### Scenario: Round-trip fidelity
- **WHEN** messages are written via `SetInputMessages` and read via `GetProtocolInputMessages` (or vice versa)
- **THEN** the semantic content is equivalent (roles, text, tool interactions preserved)

## MODIFIED Requirements

### Requirement: Completions engine input resolution
The completions engine SHALL support delegating input resolution to the protocol-typed accessor internally.

#### Scenario: Engine reads input via protocol accessor
- **WHEN** `GetQueryInputMessages` is called by the completions engine
- **THEN** it MAY internally call `GetProtocolInputMessages` and convert to its internal `Message` type
- **AND** the resulting messages are functionally equivalent to the previous direct deserialization
