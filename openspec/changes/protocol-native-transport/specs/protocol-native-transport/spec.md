## MODIFIED Requirements

### Requirement: Protocol-native agent execution interface
Agent and team execution loops SHALL operate on `protocol.Message` as their internal message type. OpenAI type conversion SHALL occur only at the model call boundary.

#### Scenario: Agent executes locally with protocol messages
- **WHEN** an agent executes a local model call
- **THEN** internal message accumulation uses `protocol.Message`
- **AND** conversion to OpenAI types occurs only at the model API call site

#### Scenario: Team orchestration accumulates protocol history
- **WHEN** a team runs multiple member executions
- **THEN** history is accumulated as `[]protocol.Message`
- **AND** team/member attribution is carried as extension-scoped semantics with a documented schema
- **AND** OpenAI `assistant.name` is treated as a compatibility mapping target, not the canonical source of attribution

#### Scenario: Existing OpenAI-typed interface still works
- **WHEN** a caller invokes the existing OpenAI-typed `Execute` method
- **THEN** the method delegates to the protocol-typed counterpart with an adapter
- **AND** the caller receives the same result shape as before

### Requirement: Protocol-native memory interface
The memory interface SHALL accept and return `protocol.Message` types. Conversion to provider-specific formats SHALL occur only at the persistence wire boundary.

#### Scenario: Persist protocol messages to memory
- **WHEN** execution results are saved to memory
- **THEN** the `MemoryInterface` accepts `[]protocol.Message`
- **AND** the HTTP adapter converts to the wire format expected by the storage service

#### Scenario: Restore protocol messages from memory
- **WHEN** conversation history is loaded from memory
- **THEN** the HTTP adapter converts stored messages to `[]protocol.Message`
- **AND** internal callers receive protocol-native types

#### Scenario: Existing OpenAI memory methods still work
- **WHEN** a caller invokes `AddMessages`/`GetMessages` with OpenAI types
- **THEN** the call delegates to the protocol methods with conversion
- **AND** the result is equivalent to direct OpenAI memory access

### Requirement: Protocol-native streaming events
The streaming subsystem SHALL define a protocol-native event type. Legacy consumers SHALL receive OpenAI chunk shapes via an explicit compatibility adapter.

#### Scenario: Stream emits protocol events
- **WHEN** the execution engine produces a streaming chunk
- **THEN** the chunk is represented as a protocol-native stream event
- **AND** the compatibility adapter converts it to `ChunkWithMetadata` for legacy consumers

#### Scenario: Legacy stream consumers see unchanged output
- **WHEN** a dashboard or broker subscribes to streaming events
- **THEN** the adapter produces the exact same OpenAI chunk shape as the current implementation

### Requirement: Engine-neutral query input accessors
The query API SHALL provide engine-neutral input accessors that return `[]protocol.Message` alongside existing OpenAI-typed accessors.

#### Scenario: Engine reads query input as protocol messages
- **WHEN** an execution engine reads query input via the new accessor
- **THEN** it receives `[]protocol.Message` without depending on OpenAI types

#### Scenario: Legacy accessor still works
- **WHEN** existing code reads query input via `GetInputMessages`
- **THEN** it receives OpenAI-typed messages as before

### Requirement: Handler accepts protocol messages directly
The handler `buildA2AResponse` SHALL accept `[]protocol.Message` as a primary input path. Legacy OpenAI input SHALL be supported via conversion adapter.

#### Scenario: Protocol-native response building
- **WHEN** migrated callers pass `[]protocol.Message` to the handler
- **THEN** the handler builds the A2A response directly from protocol messages
- **AND** the legacy `messages` field is derived via protocol-to-OpenAI conversion

#### Scenario: Legacy response building unchanged
- **WHEN** unmigrated callers pass OpenAI messages to the handler
- **THEN** the handler converts to protocol messages internally
- **AND** the output A2A response is identical to the protocol-native path

### Requirement: Compatibility adapters maintained as long-lived code
All compatibility adapters introduced during migration SHALL be maintained as first-class code with parity and safety fixes. Removal SHALL require adoption evidence and is tracked separately.

#### Scenario: Adapter receives parity fix
- **WHEN** a bug is found in a compatibility adapter
- **THEN** the adapter SHALL be fixed to maintain behavioral parity

#### Scenario: Adapter retirement proposed
- **WHEN** a proposal is made to remove a compatibility adapter
- **THEN** evidence of zero remaining consumers SHALL be provided
- **AND** the removal SHALL be tracked as a separate work item

### Requirement: Extension-governed team attribution
Turn attribution semantics beyond `Message.role` SHALL be represented as extension-governed data and declared explicitly.
This requirement mitigates the `Protocol message expressiveness` risk.

#### Scenario: Attribution semantics present on protocol message
- **WHEN** a protocol message carries team/member attribution
- **THEN** the message declares the extension URI in `extensions`
- **AND** the attribution payload is schema-defined and namespaced by that extension

### Requirement: Native-first extension scoping
Extension usage SHALL be gated by native-A2A-first semantics and minimal inventory policy.

#### Scenario: Evaluate extension need for a capability
- **WHEN** Ark defines semantics for teams, history, or callback loop behavior
- **THEN** core A2A role/parts/task semantics are used first
- **AND** an extension is introduced only for residual semantics not representable natively

#### Scenario: Controller verifies extension capability at dispatch
- **WHEN** dispatch requires an extension URI for request semantics
- **THEN** controller-side Agent Card capability verification checks `capabilities.extensions` for the URI
- **AND** missing declaration records warning/telemetry and continues dispatch under `soft_fail_warn` policy
