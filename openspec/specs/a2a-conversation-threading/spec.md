## ADDED Requirements

### Requirement: Controller sends conversationId as A2A contextId
The controller `sendQueryA2A()` SHALL send `query.Spec.ConversationId` as the A2A `Message.ContextID` field when dispatching to any engine (completions or named). When `conversationId` is empty, the message SHALL be sent without a contextId.

#### Scenario: Query with conversationId dispatched to completions engine
- **WHEN** the controller dispatches a query with `spec.conversationId: "conv-123"` to the completions engine
- **THEN** the A2A message is created with `ContextID` set to `"conv-123"`

#### Scenario: Query with conversationId dispatched to named engine
- **WHEN** the controller dispatches a query with `spec.conversationId: "conv-456"` to a named execution engine
- **THEN** the A2A message is created with `ContextID` set to `"conv-456"`

#### Scenario: Query without conversationId
- **WHEN** the controller dispatches a query with empty `spec.conversationId`
- **THEN** the A2A message is created without a `ContextID` (nil pointer)

### Requirement: Completions engine reads conversationId from A2A message
The completions engine `setupExecution()` SHALL read the conversation ID from the incoming A2A message's `ContextID` field as the primary source. It SHALL fall back to `query.Spec.ConversationId` from the Query CR if the A2A message has no context ID.

#### Scenario: A2A message has contextId
- **WHEN** the completions engine receives an A2A message with `ContextID: "conv-123"`
- **THEN** it uses `"conv-123"` as the conversation ID for memory operations

#### Scenario: A2A message has no contextId, Query CR has conversationId
- **WHEN** the completions engine receives an A2A message without contextId and the Query CR has `spec.conversationId: "conv-fallback"`
- **THEN** it uses `"conv-fallback"` as the conversation ID for memory operations

#### Scenario: Neither A2A message nor Query CR has conversationId
- **WHEN** the completions engine receives an A2A message without contextId and the Query CR has empty conversationId
- **THEN** the broker creates a new conversation and returns a new UUID

### Requirement: Controller extracts contextId into status.conversationId
The controller `extractEngineResponseMeta()` SHALL write the A2A response's contextId to `query.Status.ConversationId` in addition to `query.Status.A2A.ContextID`.

#### Scenario: Engine returns contextId in A2A response
- **WHEN** an engine returns an A2A response with `ContextID: "conv-789"`
- **THEN** the controller sets both `status.conversationId` and `status.a2a.contextId` to `"conv-789"`

#### Scenario: Engine returns no contextId
- **WHEN** an engine returns an A2A response without a contextId
- **THEN** `status.conversationId` retains the value set by the completions engine's memory flow (if any) and `status.a2a.contextId` remains empty

### Requirement: CRD field comments reflect unified semantics
The godoc comments on `QuerySpec.ConversationId` SHALL state that the field is sent as A2A `ContextID` to execution engines. The comment on `A2AMetadata.ContextID` SHALL clarify it contains the contextId returned by the engine.

#### Scenario: Developer reads QuerySpec.ConversationId godoc
- **WHEN** a developer reads the godoc for `QuerySpec.ConversationId`
- **THEN** the comment explains it is sent as A2A ContextID when dispatching to engines

### Requirement: Documentation reflects unified conversation threading model
The docs SHALL present `conversationId` as the universal conversation threading mechanism that works with all engines. The `a2a-context-id` annotation SHALL be documented as an advanced override for sub-agent dispatch.

#### Scenario: Developer reads query reference docs
- **WHEN** a developer reads `docs/content/reference/resources/query.mdx`
- **THEN** `conversationId` is described as the conversation threading identifier sent to all engines via A2A

#### Scenario: Developer reads A2A queries guide
- **WHEN** a developer reads `docs/content/developer-guide/queries/a2a-queries.mdx`
- **THEN** `conversationId` is the primary mechanism for stateful conversations, and `a2a-context-id` annotation is documented as an advanced override for sub-agent dispatch

#### Scenario: Upgrading guide documents the change
- **WHEN** a developer reads `docs/content/reference/upgrading.mdx`
- **THEN** a new entry explains that `conversationId` now flows through A2A protocol and named engines can access it
