## ADDED Requirements

### Requirement: OpenAI endpoints removed from ark-api
The ark-api SHALL remove the `/openai/v1/chat/completions` POST endpoint, the `/openai/v1/models` GET endpoint, the `ChatCompletionRequest` model, the streaming proxy function, and the `/openai/v1/chat/completions` entry from ReadOnlyMiddleware.

#### Scenario: Client calls removed completions endpoint
- **WHEN** a client sends a POST request to `/openai/v1/chat/completions`
- **THEN** the server returns 404

#### Scenario: Client calls removed models endpoint
- **WHEN** a client sends a GET request to `/openai/v1/models`
- **THEN** the server returns 404

#### Scenario: Read-only mode no longer whitelists removed endpoint
- **WHEN** the ark-api is in read-only mode
- **THEN** the middleware whitelist does not reference `/openai/v1/chat/completions`

### Requirement: Dashboard streams via query API and broker proxy
The dashboard SHALL create queries via `POST /api/v1/queries/` with the streaming annotation (`ark.mckinsey.com/streaming-enabled: "true"`), then consume SSE via `GET /api/v1/broker/chunks?watch=true&query-id={queryName}` through the ark-api broker proxy. The dashboard SHALL NOT call the broker service directly.

#### Scenario: Dashboard sends a streaming chat message
- **WHEN** a user sends a message in the dashboard with streaming enabled
- **THEN** the dashboard creates a query via `/api/v1/queries/` with the streaming annotation and streams results from `/api/v1/broker/chunks`

#### Scenario: Dashboard sends a non-streaming chat message
- **WHEN** a user sends a message in the dashboard with streaming disabled
- **THEN** the dashboard creates a query via `/api/v1/queries/` and polls for the result

### Requirement: CLI uses query API instead of OpenAI SDK
The ark-cli SHALL create queries via the query API (`/api/v1/queries/`) instead of wrapping the OpenAI SDK pointing at `/openai/v1`. For streaming, it SHALL use the same broker proxy pattern as the dashboard.

#### Scenario: CLI sends a query
- **WHEN** a user runs a query command in ark-cli
- **THEN** the CLI creates a query via `/api/v1/queries/` with string input

#### Scenario: CLI streams a response
- **WHEN** a user runs a streaming query in ark-cli
- **THEN** the CLI creates a query with the streaming annotation and consumes SSE from the broker proxy

### Requirement: Dashboard API dialog updated
The dashboard agents-api-dialog SHALL show the query API endpoint and updated code snippets instead of the removed OpenAI endpoint.

#### Scenario: User views API integration dialog
- **WHEN** a user opens the API dialog for an agent
- **THEN** the dialog shows the query API endpoint with updated Python/Go/Bash code snippets

### Requirement: Dashboard sends single message with conversationId
The dashboard chat session hook SHALL send only the current user message and a `conversationId` (if continuing a conversation) instead of accumulating and re-sending all messages.

#### Scenario: User sends first message in dashboard
- **WHEN** a user types a message in a new chat session
- **THEN** the dashboard creates a query with the message as string input and no `conversationId`

#### Scenario: User sends follow-up message in dashboard
- **WHEN** a user sends a second message in an existing chat session
- **THEN** the dashboard creates a query with the message as string input and `conversationId` from the previous response

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
During the deprecation period, a mutating webhook SHALL convert `type: "messages"` queries from direct CRD users by extracting the last user message and rewriting to `type: "user"` with a migration warning annotation.

#### Scenario: Direct CRD user submits type messages query
- **WHEN** a Query with `type: "messages"` and a message array is submitted via kubectl during the deprecation period
- **THEN** the webhook extracts the last user message, rewrites the spec to `type: "user"` with the extracted text, and adds a migration warning annotation

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

### Requirement: CI/CD health check updated
The CI/CD workflow SHALL use a different endpoint for the ark-api health check instead of `/openai/v1/models`.

#### Scenario: CI pipeline verifies ark-api is running
- **WHEN** the CI/CD pipeline checks ark-api health
- **THEN** it uses a non-OpenAI endpoint (e.g., `/api/v1/agents/` or a dedicated health endpoint)

### Requirement: Migration guide for external users
Documentation SHALL include a migration guide for external users who integrated with Ark via the OpenAI SDK, showing how to switch to the query API.

#### Scenario: External user reads migration guide
- **WHEN** a developer who previously used the OpenAI SDK reads the upgrading docs
- **THEN** they find step-by-step instructions for migrating to the query API with equivalent code examples
