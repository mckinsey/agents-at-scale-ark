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
This requirement mitigates the `Conversion parity` risk.

#### Scenario: Generate legacy response.raw content
- **WHEN** `buildA2AResponse` constructs the A2A response from protocol messages
- **THEN** it also produces OpenAI-compatible JSON via `protocolToOpenAIJSON` for the `messages` metadata
- **AND** the JSON output is structurally equivalent to what the pre-change direct serialization produced
- **AND** extension-scoped attribution semantics map deterministically to compatibility fields

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

### Requirement: Shared conversion fidelity semantics
Handler conversion rules SHALL align with the memory conversion matrix for required-lossless fields.

#### Scenario: Protocol semantic fidelity at handler boundary
- **WHEN** protocol response messages include DataParts and extension-scoped attribution
- **THEN** required-lossless semantics are preserved in protocol-native output
- **AND** compatibility serialization behavior is documented where lossy mapping is unavoidable

### Requirement: Native-first extension boundary scope
Handler response construction SHALL not introduce additional extension contracts when native protocol semantics are sufficient.

#### Scenario: History and callback-loop semantics at handler boundary
- **WHEN** response construction processes history-derived or callback-loop-related data
- **THEN** semantics are represented through core protocol messages/tasks
- **AND** no history-specific or callback-specific extension is required for current scope

#### Scenario: Compatibility output mapping source of truth
- **WHEN** compatibility JSON fields (including `assistant.name`) are produced
- **THEN** they are derived from canonical protocol semantics and extension attribution mappings
