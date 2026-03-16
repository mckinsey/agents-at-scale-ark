## ADDED Requirements

### Requirement: Generic multi-extension API per A2A spec Section 4.6.2
Ark SHALL provide a generic, composable API for setting and reading A2A extensions on protocol messages, following the pattern defined in A2A Protocol Specification v1.0 Section 4.6.2.

#### Scenario: SetExtension adds URI to extensions and payload to metadata
- **WHEN** `SetExtension(msg, uri, payload)` is called
- **THEN** the URI SHALL appear in `msg.Extensions` (deduplicated)
- **AND** the payload SHALL be set in `msg.Metadata[uri]`

#### Scenario: SetExtension deduplicates on repeated calls
- **WHEN** `SetExtension` is called twice with the same URI but different payloads
- **THEN** `msg.Extensions` SHALL contain the URI exactly once
- **AND** the payload SHALL be updated to the latest value

#### Scenario: SetMetadata does not add to extensions
- **WHEN** `SetMetadata(msg, key, value)` is called with a non-extension key
- **THEN** the key SHALL appear in `msg.Metadata`
- **AND** the key SHALL NOT appear in `msg.Extensions`

#### Scenario: HasExtension distinguishes declared extensions from bare metadata
- **WHEN** a URI was added via `SetExtension`
- **THEN** `HasExtension(msg, uri)` SHALL return true
- **WHEN** a key was added via `SetMetadata` only
- **THEN** `HasExtension(msg, key)` SHALL return false

### Requirement: Protocol-native response field in execution-context payload
The handler SHALL write a versioned protocol-native response field (`responseMessagesV1`) containing `[]protocol.Message` JSON into the `ExecutionContextExtensionURI` metadata of the A2A response message.

#### Scenario: Handler populates responseMessagesV1 alongside legacy messages
- **WHEN** the handler builds an A2A response after successful execution
- **THEN** the response message metadata under `ExecutionContextExtensionURI` SHALL contain both `responseMessagesV1` (protocol-native `[]protocol.Message` JSON) and `messages` (legacy OpenAI-shaped JSON)

#### Scenario: Handler uses SetExecutionContextExtension for spec-compliant extension
- **WHEN** the handler builds an A2A response message
- **THEN** `SetExecutionContextExtension` SHALL be used to add the extension URI to `Message.extensions` and the payload to `Message.metadata`
- **AND** `SetMetadata` SHALL be used for the legacy `ArkMetadataKey` (NOT added to `Message.extensions`)

### Requirement: Full-fidelity protocol conversion using DataParts
The handler SHALL convert OpenAI message types to protocol messages with DataParts that preserve all structured execution data.

#### Scenario: Tool calls preserved as DataParts
- **WHEN** an assistant message contains tool calls
- **THEN** each tool call SHALL be represented as a `DataPart` with `data.type = "tool_call"`, `data.id`, and `data.function` containing name and arguments

#### Scenario: Tool results preserved as DataParts
- **WHEN** a tool message is converted
- **THEN** it SHALL be represented as a `DataPart` with `data.type = "tool_result"`, `data.tool_call_id`, and `data.content`

#### Scenario: System messages preserved as DataParts
- **WHEN** a system message is converted
- **THEN** it SHALL be represented as a `DataPart` with `data.type = "system"` and `data.content` (NOT silently dropped)

#### Scenario: Function results preserved as DataParts
- **WHEN** a function message is converted
- **THEN** it SHALL be represented as a `DataPart` with `data.type = "function_result"`, `data.name`, and `data.content`

### Requirement: DataPart extraction helpers
Ark SHALL provide reusable helpers for consuming DataParts from protocol messages.

#### Scenario: ExtractDataParts filters mixed parts
- **WHEN** `ExtractDataParts(parts)` is called on a slice containing both TextParts and DataParts
- **THEN** only the DataParts SHALL be returned

#### Scenario: DataPartType reads the type field
- **WHEN** `DataPartType(dp)` is called on a DataPart with `data.type = "tool_call"`
- **THEN** it SHALL return `"tool_call"`

### Requirement: Protocol-first extraction precedence in controller
The controller SHALL extract response metadata preferring `responseMessagesV1` first, legacy `messages` second, assistant-text fallback third.

#### Scenario: Controller prefers protocol-native responseMessagesV1
- **WHEN** the response metadata contains both `responseMessagesV1` and legacy `messages`
- **THEN** the controller SHALL use `responseMessagesV1` to derive `response.raw`

#### Scenario: Controller falls back to legacy messages
- **WHEN** the response metadata does not contain `responseMessagesV1` but contains a legacy `messages` field
- **THEN** the controller SHALL use the legacy `messages` field for `response.raw`

#### Scenario: Controller falls back to assistant text
- **WHEN** the response metadata contains neither `responseMessagesV1` nor legacy `messages`
- **THEN** the controller SHALL construct a single-element assistant message array from the response text for `response.raw`

### Requirement: Full-fidelity protocol-to-raw reconstruction
The controller SHALL reconstruct OpenAI-compatible JSON from protocol messages by mapping DataParts back to their original role and structure.

#### Scenario: Tool call DataParts reconstruct to assistant with tool_calls
- **WHEN** a protocol message contains `DataPart` with `data.type = "tool_call"`
- **THEN** `response.raw` SHALL contain `{"role":"assistant","tool_calls":[...]}`

#### Scenario: Tool result DataParts reconstruct to tool role
- **WHEN** a protocol message contains `DataPart` with `data.type = "tool_result"`
- **THEN** `response.raw` SHALL contain `{"role":"tool","tool_call_id":"...","content":"..."}`

#### Scenario: System DataParts reconstruct to system role
- **WHEN** a protocol message contains `DataPart` with `data.type = "system"`
- **THEN** `response.raw` SHALL contain `{"role":"system","content":"..."}`

### Requirement: Extension URI declaration on outbound controller messages
The controller SHALL use `SetExtension` to declare `ExecutionContextExtensionURI` on all outbound messages to execution engines, and `SetMetadata` for legacy `ArkMetadataKey`.

#### Scenario: Controller sets extensions on engine request
- **WHEN** the controller constructs an A2A message to send to the execution engine
- **THEN** `SetExtension` SHALL add `ExecutionContextExtensionURI` to `Message.extensions` and the payload to `Message.metadata`
- **AND** `SetMetadata` SHALL add `ArkMetadataKey` to `Message.metadata` only (NOT to `Message.extensions`)

### Requirement: Backward-compatible metadata extraction
The handler and controller SHALL use `GetExtension` to read from `ExecutionContextExtensionURI` first, falling back to `GetMetadata` for `ArkMetadataKey`.

#### Scenario: Handler extracts from extension URI key
- **WHEN** the inbound message metadata contains `ExecutionContextExtensionURI`
- **THEN** `GetExtension(msg, ExecutionContextExtensionURI)` SHALL return the payload

#### Scenario: Handler falls back to legacy ArkMetadataKey
- **WHEN** the inbound message metadata does not contain `ExecutionContextExtensionURI` but contains `ArkMetadataKey`
- **THEN** `GetMetadata(msg, ArkMetadataKey)` SHALL return the legacy payload

#### Scenario: Controller extracts from extension URI key
- **WHEN** the response message metadata contains `ExecutionContextExtensionURI`
- **THEN** `GetExtension(msg, ExecutionContextExtensionURI)` SHALL return the response payload

#### Scenario: Controller falls back to legacy ArkMetadataKey
- **WHEN** the response message metadata does not contain `ExecutionContextExtensionURI` but contains `ArkMetadataKey`
- **THEN** `GetMetadata(msg, ArkMetadataKey)` SHALL return the legacy payload
