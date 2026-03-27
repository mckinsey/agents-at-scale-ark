## ADDED Requirements

### Requirement: Model CRD supports anthropic provider enum value
The Model CRD `spec.provider` field SHALL accept `anthropic` as a valid enum value alongside `openai`, `azure`, and `bedrock`.

#### Scenario: Valid anthropic provider value accepted
- **WHEN** a Model resource is created with `spec.provider: anthropic` and valid `spec.config.anthropic` config
- **THEN** the webhook SHALL accept the resource

#### Scenario: Anthropic provider without config rejected
- **WHEN** a Model resource is created with `spec.provider: anthropic` and no `spec.config.anthropic` block
- **THEN** the webhook SHALL reject the resource with error "anthropic configuration is required for anthropic provider"

### Requirement: AnthropicModelConfig CRD type
The Model CRD SHALL include an `AnthropicModelConfig` type in `spec.config.anthropic` with the following fields:
- `baseUrl` (ValueSource, required): Anthropic API endpoint
- `apiKey` (ValueSource, required): API key for authentication
- `version` (ValueSource, optional): Anthropic API version header value
- `headers` ([]Header, optional): Custom HTTP headers
- `properties` (map[string]ValueSource, optional): Additional request parameters

#### Scenario: Minimal valid anthropic config
- **WHEN** a Model is created with `spec.provider: anthropic` and config containing `baseUrl` and `apiKey`
- **THEN** the webhook SHALL accept the resource

#### Scenario: Anthropic config with all fields
- **WHEN** a Model is created with `spec.provider: anthropic` and config containing `baseUrl`, `apiKey`, `version`, `headers`, and `properties`
- **THEN** the webhook SHALL accept the resource

#### Scenario: Anthropic config missing required baseUrl
- **WHEN** a Model is created with `spec.provider: anthropic` and config missing `baseUrl`
- **THEN** the webhook SHALL reject the resource

#### Scenario: Anthropic config missing required apiKey
- **WHEN** a Model is created with `spec.provider: anthropic` and config missing `apiKey`
- **THEN** the webhook SHALL reject the resource

#### Scenario: Anthropic config baseUrl validated for security
- **WHEN** a Model is created with `spec.provider: anthropic` and a `baseUrl` using a non-HTTPS scheme
- **THEN** the webhook SHALL reject the resource per existing URL security validation

### Requirement: Anthropic provider in completions executor
The completions executor SHALL support `provider: anthropic` Models for chat completion requests, converting between the internal OpenAI message format and the Anthropic Messages API format.

#### Scenario: Chat completion with anthropic provider
- **WHEN** a query targets a Model with `provider: anthropic`
- **THEN** the completions executor SHALL send a POST request to `{baseUrl}/messages` with Anthropic-format messages and return the response normalized to OpenAI ChatCompletion format

#### Scenario: Tool calls with anthropic provider
- **WHEN** a query with tools targets a Model with `provider: anthropic`
- **THEN** the completions executor SHALL convert tools to Anthropic format, send them in the request, and convert `tool_use` response blocks back to OpenAI tool call format

#### Scenario: System message handling
- **WHEN** messages include a system message
- **THEN** the completions executor SHALL extract it into the Anthropic `system` field and exclude it from the `messages` array

#### Scenario: Streaming with anthropic provider
- **WHEN** a streaming query targets a Model with `provider: anthropic`
- **THEN** the completions executor SHALL return the full response as a single streaming chunk (fallback mode)

#### Scenario: Version header applied
- **WHEN** `spec.config.anthropic.version` is set
- **THEN** the completions executor SHALL send it as the `anthropic-version` HTTP header
- **WHEN** `spec.config.anthropic.version` is not set
- **THEN** the completions executor SHALL default to `2023-06-01`

### Requirement: Anthropic provider health check
The Model controller SHALL probe Anthropic provider Models for health using a test completion request.

#### Scenario: Healthy anthropic model
- **WHEN** a test message to the Anthropic API returns a successful response
- **THEN** the model status condition `ModelAvailable` SHALL be set to `True`

#### Scenario: Unhealthy anthropic model
- **WHEN** a test message to the Anthropic API returns an error
- **THEN** the model status condition `ModelAvailable` SHALL be set to `False` with the error message

### Requirement: Shared Anthropic format module
The Anthropic message format types and conversion functions SHALL be shared between the Bedrock and Anthropic providers via a common module (`anthropic_format.go`).

#### Scenario: Bedrock provider uses shared format
- **WHEN** the Bedrock provider processes a request
- **THEN** it SHALL use the shared Anthropic format types and conversion functions (no duplicate type definitions)

#### Scenario: Anthropic provider uses shared format
- **WHEN** the Anthropic provider processes a request
- **THEN** it SHALL use the same shared Anthropic format types and conversion functions as Bedrock

### Requirement: API supports anthropic provider
The Ark API service SHALL support creating and managing Models with `provider: anthropic` and `AnthropicConfig`.

#### Scenario: Create model with anthropic provider via API
- **WHEN** a POST request creates a Model with `provider: "anthropic"` and anthropic config
- **THEN** the API SHALL create the Model resource with the anthropic configuration

### Requirement: Dashboard supports anthropic provider
The Ark Dashboard SHALL support selecting Anthropic as a provider and configuring its settings.

#### Scenario: Anthropic provider in model form
- **WHEN** a user creates or edits a Model in the Dashboard
- **THEN** the provider dropdown SHALL include "Anthropic" as an option
- **THEN** selecting it SHALL show fields for base URL, API key, and version

### Requirement: CLI supports anthropic provider
The Ark CLI SHALL support creating Models with the Anthropic provider through its interactive model creation flow.

#### Scenario: Anthropic provider in CLI model creation
- **WHEN** a user runs the CLI model creation command
- **THEN** the provider selection SHALL include "anthropic" as an option
- **THEN** selecting it SHALL prompt for base URL, API key, and optional version
