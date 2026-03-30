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

### Requirement: Query CRD removes type messages support and openai-go import
The Query CRD SHALL remove the `QueryTypeMessages` constant, `type: "messages"` input mode, `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()` methods. The `github.com/openai/openai-go` import SHALL be removed from `api/v1alpha1/query_types.go`. The `spec.type` field SHALL only accept `"user"` (or empty, defaulting to `"user"`).

#### Scenario: Query created with type user
- **WHEN** a Query CRD is created with `spec.type: "user"` and `spec.input: "hello"`
- **THEN** the Query is accepted and processed normally

#### Scenario: Query created with no type specified
- **WHEN** a Query CRD is created without `spec.type`
- **THEN** it defaults to `"user"` and processes normally

#### Scenario: CRD types have no provider SDK dependency
- **WHEN** a developer inspects the imports of `ark/api/v1alpha1/query_types.go`
- **THEN** there is no `openai-go` or other LLM provider SDK import

### Requirement: Mutating webhook migrates type messages queries during deprecation period
During the deprecation period, a mutating webhook SHALL convert `type: "messages"` queries by extracting the last user message, storing messages in the memory service, rewriting to `type: "user"` with `conversationId`, and adding a migration warning annotation.

#### Scenario: Legacy client submits type messages query
- **WHEN** a Query with `type: "messages"` and a message array is submitted during the deprecation period
- **THEN** the webhook extracts the last user message, stores messages in memory, rewrites the spec to `type: "user"` with the extracted text and a `conversationId`, and adds a migration warning annotation

### Requirement: Shared query input resolver
The controller SHALL resolve query input text using `resolution.ResolveQueryInputText` in `ark/internal/resolution/query_input.go` without importing the completions executor package. The resolver SHALL handle string input with Go template parameter expansion, resolving parameter values from inline values, ConfigMap refs, and Secret refs via existing shared helpers.

#### Scenario: Controller extracts text from query with template parameters
- **WHEN** a query has `spec.input: "Weather in {{.location}}"` with a parameter `location` referencing a ConfigMap
- **THEN** the controller calls `resolution.ResolveQueryInputText` which resolves the ConfigMap value and returns the expanded string

#### Scenario: Controller extracts plain text input
- **WHEN** a query has `spec.input: "hello"` with no parameters
- **THEN** the resolver returns `"hello"` directly

### Requirement: Controller does not import completions package
The query controller SHALL NOT import the completions executor package. User input extraction SHALL use the shared resolver. Response serialization SHALL use `buildFallbackRaw` without completions message types.

#### Scenario: Controller processes a query
- **WHEN** the controller reconciles a Query with `spec.input: "hello"`
- **THEN** it calls the shared resolver, creates an A2A TextPart with `"hello"`, and dispatches without any completions package calls

#### Scenario: Controller serializes response without raw messages from engine
- **WHEN** the engine response does not include `MessagesRaw` in A2A metadata
- **THEN** the controller calls `buildFallbackRaw` which produces `[{"role":"assistant","content":"<text>"}]` without completions types

#### Scenario: Controller serializes response with raw messages from engine
- **WHEN** the engine response includes `MessagesRaw` in A2A metadata under `QueryExtensionMetadataKey`
- **THEN** the controller writes the value directly to `response.raw` with no deserialization

### Requirement: Deduplicated ConfigMap/Secret resolution
The completions package SHALL delegate ConfigMap and Secret resolution to the shared helpers in `ark/internal/resolution/`. The duplicate `resolveConfigMapKeyRef` (`query_parameters.go:72`) and `resolveSecretKeyRef` (`:85`) SHALL be replaced with calls to `resolution.ResolveFromConfigMap` (`headers.go:85`) and `resolution.ResolveFromSecret` (`headers.go:66`).

#### Scenario: Completions resolves ConfigMap parameter
- **WHEN** the completions engine resolves a parameter with a ConfigMap reference
- **THEN** it delegates to `resolution.ResolveFromConfigMap` and returns the same value as the controller resolver would

### Requirement: Executor metadata reliability
The completions handler SHALL reliably populate `messages` metadata in A2A responses under `QueryExtensionMetadataKey`. The `serializeResponseMessages` function SHALL handle empty response messages gracefully rather than returning an empty string.

#### Scenario: Completions handler builds A2A response with messages
- **WHEN** the completions handler constructs an A2A response from execution results
- **THEN** it includes serialized OpenAI-compatible messages under `QueryExtensionMetadataKey`

#### Scenario: Completions handler builds A2A response with empty messages
- **WHEN** execution returns empty response messages
- **THEN** the handler includes a minimal fallback message in metadata rather than omitting the field
