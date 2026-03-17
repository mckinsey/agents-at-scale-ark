## MODIFIED Requirements

### Requirement: Protocol-native response construction
`buildA2AResponse` SHALL operate on `protocol.Message` as its primary input type.

#### Scenario: Protocol messages available from execution
- **WHEN** the execution result contains `ProtocolResponseMessages`
- **THEN** `buildA2AResponse` uses them directly to construct the A2A response
- **AND** no OpenAI-to-protocol conversion occurs

#### Scenario: Only OpenAI messages available from execution
- **WHEN** the execution result contains only `ResponseMessages` (OpenAI-typed)
- **THEN** an adapter converts them to `protocol.Message` before calling `buildA2AResponse`
- **AND** the resulting A2A response is equivalent to the protocol-native path

### Requirement: Protocol-to-OpenAI serialization for response.raw
The handler SHALL serialize protocol messages to OpenAI-compatible JSON for the `messages` metadata field.

#### Scenario: Generate legacy response.raw content
- **WHEN** `buildA2AResponse` constructs the A2A response from protocol messages
- **THEN** it also produces OpenAI-compatible JSON via `protocolToOpenAIJSON` for the `messages` metadata
- **AND** the JSON output is structurally equivalent to what the pre-change direct serialization produced

## ADDED Requirements

### Requirement: Execution result protocol message support
`ExecutionResult` SHALL support carrying protocol-typed response messages alongside OpenAI-typed messages.

#### Scenario: Dual-carry execution result
- **WHEN** an execution path produces protocol messages
- **THEN** `ExecutionResult.ProtocolResponseMessages` is populated
- **AND** the handler prefers this field over `ExecutionResult.ResponseMessages`

### Requirement: Dual-write continuity
Both `responseMessagesV1` and `messages` metadata SHALL continue to be populated in the A2A response.

#### Scenario: Both response formats present
- **WHEN** `buildA2AResponse` completes
- **THEN** the A2A response contains `responseMessagesV1` (protocol-native) and `messages` (OpenAI-compatible JSON)
- **AND** both contain equivalent semantic content
