## ADDED Requirements

### Requirement: OpenAI endpoint stores messages in memory service before creating Query
The ark-api `/openai/v1/chat/completions` endpoint SHALL store the incoming `messages[]` array in the memory service before creating the Query CRD. If a `conversationId` is provided in request metadata, it SHALL append to that conversation. If no `conversationId` is provided, it SHALL create a new conversation and use the returned ID.

#### Scenario: First message in a new conversation
- **WHEN** a chat completion request arrives with `messages` array and no `conversationId` in metadata
- **THEN** the endpoint creates a new conversation in the memory service, stores the messages, and creates a Query with `type: "user"`, the last user message as `spec.input`, and the new `conversationId`

#### Scenario: Continuation of existing conversation
- **WHEN** a chat completion request arrives with `messages` array and `conversationId: "conv-123"` in metadata
- **THEN** the endpoint appends messages to conversation `"conv-123"` in the memory service and creates a Query with `type: "user"`, the last user message as `spec.input`, and `conversationId: "conv-123"`

#### Scenario: Single message request
- **WHEN** a chat completion request arrives with a single user message in `messages[]`
- **THEN** the endpoint stores that message in the memory service and creates a Query with the message content as `spec.input`

### Requirement: OpenAI endpoint extracts last user message as Query input
The endpoint SHALL extract the text content of the last message with `role: "user"` from the `messages[]` array and use it as the Query's `spec.input` string.

#### Scenario: Multiple messages with last being user message
- **WHEN** `messages` contains `[{role: "user", content: "hello"}, {role: "assistant", content: "hi"}, {role: "user", content: "how are you"}]`
- **THEN** the Query `spec.input` is `"how are you"`

#### Scenario: User message with complex content
- **WHEN** the last user message has `content` as an array with a text part
- **THEN** the endpoint extracts the text from the first text-type content part

### Requirement: OpenAI endpoint creates Query with type user
The endpoint SHALL always create Queries with `type: "user"` instead of `type: "messages"`. The `spec.input` field SHALL contain the extracted user message string.

#### Scenario: Query resource created from chat completion request
- **WHEN** the endpoint creates a Query CRD
- **THEN** the Query has `spec.type: "user"` and `spec.input` is a string, not a message array

### Requirement: Query response includes conversationId
The endpoint SHALL include the `conversationId` in the response metadata so clients can continue the conversation.

#### Scenario: Non-streaming response
- **WHEN** a non-streaming chat completion request completes
- **THEN** the response includes the `conversationId` in the response object or metadata

#### Scenario: Streaming response final chunk
- **WHEN** a streaming chat completion completes
- **THEN** the final SSE chunk includes the `conversationId` for the client to store

### Requirement: Dashboard sends single message with conversationId
The dashboard chat session hook SHALL send only the current user message and a `conversationId` (if continuing a conversation) instead of accumulating and re-sending all messages.

#### Scenario: User sends first message in dashboard
- **WHEN** a user types a message in a new chat session
- **THEN** the dashboard sends a request with `messages: [{role: "user", content: "<text>"}]` and no `conversationId`

#### Scenario: User sends follow-up message in dashboard
- **WHEN** a user sends a second message in an existing chat session
- **THEN** the dashboard sends a request with `messages: [{role: "user", content: "<text>"}]` and `conversationId` from the previous response

#### Scenario: Dashboard displays conversation history
- **WHEN** a user views an active conversation
- **THEN** the dashboard fetches message history from the API (backed by memory service) for display

### Requirement: Query CRD removes type messages support
The Query CRD SHALL remove the `QueryTypeMessages` constant and `type: "messages"` input mode. The `spec.type` field SHALL only accept `"user"` (or empty, defaulting to `"user"`). The `GetInputMessages()` and `SetInputMessages()` methods SHALL be removed from the Query type.

#### Scenario: Query created with type user
- **WHEN** a Query CRD is created with `spec.type: "user"` and `spec.input: "hello"`
- **THEN** the Query is accepted and processed normally

#### Scenario: Query created with no type specified
- **WHEN** a Query CRD is created without `spec.type`
- **THEN** it defaults to `"user"` and processes normally

### Requirement: Mutating webhook migrates type messages queries during deprecation period
During the deprecation period, a mutating webhook SHALL convert `type: "messages"` queries by extracting the last user message, storing messages in the memory service, rewriting to `type: "user"` with `conversationId`, and adding a migration warning annotation.

#### Scenario: Legacy client submits type messages query
- **WHEN** a Query with `type: "messages"` and a message array is submitted during the deprecation period
- **THEN** the webhook extracts the last user message, stores messages in memory, rewrites the spec to `type: "user"` with the extracted text and a `conversationId`, and adds a migration warning annotation

### Requirement: Controller does not import completions package
The query controller SHALL NOT import the completions executor package. User input extraction SHALL read `spec.input` as a string directly (resolving ValueSource references). Response serialization SHALL use a simple utility without completions message types.

#### Scenario: Controller processes a query
- **WHEN** the controller reconciles a Query with `spec.input: "hello"`
- **THEN** it reads the input string directly, creates an A2A TextPart with `"hello"`, and dispatches without any completions package calls

#### Scenario: Controller serializes response without raw messages from engine
- **WHEN** the engine response does not include a raw messages JSON
- **THEN** the controller wraps the response text in a simple JSON structure without using completions message types
