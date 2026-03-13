## ADDED Requirements

### Requirement: Protocol-native response field in execution-context payload
The handler SHALL write a versioned protocol-native response field (`responseMessagesV1`) containing `[]protocol.Message` JSON into the `ExecutionContextExtensionURI` metadata of the A2A response message.

#### Scenario: Handler populates responseMessagesV1 alongside legacy messages
- **WHEN** the handler builds an A2A response after successful execution
- **THEN** the response message metadata under `ExecutionContextExtensionURI` SHALL contain both `responseMessagesV1` (protocol-native `[]protocol.Message` JSON) and `messages` (legacy OpenAI-shaped JSON)

#### Scenario: Handler declares extension URI in Message.Extensions
- **WHEN** the handler builds an A2A response message
- **THEN** the response message `Extensions` field SHALL contain `ExecutionContextExtensionURI`

### Requirement: Three-tier extraction precedence in controller
The controller SHALL extract response metadata using a three-tier precedence: protocol-native field first, legacy messages second, assistant-text fallback third.

#### Scenario: Controller extracts protocol-native responseMessagesV1
- **WHEN** the response metadata under `ExecutionContextExtensionURI` contains a `responseMessagesV1` field
- **THEN** the controller SHALL use the protocol-native messages to derive `response.raw` and SHALL NOT use legacy `messages`

#### Scenario: Controller falls back to legacy messages
- **WHEN** the response metadata does not contain `responseMessagesV1` but contains a legacy `messages` field
- **THEN** the controller SHALL use the legacy `messages` field for `response.raw`

#### Scenario: Controller falls back to assistant text
- **WHEN** the response metadata contains neither `responseMessagesV1` nor legacy `messages`
- **THEN** the controller SHALL construct a single-element assistant message array from the response text for `response.raw`

### Requirement: Extension URI declaration on outbound controller messages
The controller SHALL declare `ExecutionContextExtensionURI` in `Message.Extensions` on all outbound messages to execution engines.

#### Scenario: Controller sets extensions on engine request
- **WHEN** the controller constructs an A2A message to send to the execution engine
- **THEN** the message `Extensions` field SHALL contain `ExecutionContextExtensionURI`
- **AND** the message metadata SHALL include the execution payload under the `ExecutionContextExtensionURI` key

### Requirement: Backward-compatible metadata extraction
The handler and controller SHALL read metadata from `ExecutionContextExtensionURI` first, falling back to `ArkMetadataKey` for backward compatibility.

#### Scenario: Handler extracts from extension URI key
- **WHEN** the inbound message metadata contains `ExecutionContextExtensionURI`
- **THEN** the handler SHALL use that key for ark metadata extraction

#### Scenario: Handler falls back to legacy ArkMetadataKey
- **WHEN** the inbound message metadata does not contain `ExecutionContextExtensionURI` but contains `ArkMetadataKey`
- **THEN** the handler SHALL fall back to `ArkMetadataKey` for metadata extraction

#### Scenario: Controller extracts from extension URI key
- **WHEN** the response message metadata contains `ExecutionContextExtensionURI`
- **THEN** the controller SHALL use that key for response metadata extraction

#### Scenario: Controller falls back to legacy ArkMetadataKey
- **WHEN** the response message metadata does not contain `ExecutionContextExtensionURI` but contains `ArkMetadataKey`
- **THEN** the controller SHALL fall back to `ArkMetadataKey` for response metadata extraction
