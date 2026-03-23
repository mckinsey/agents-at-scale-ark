## ADDED Requirements

### Requirement: Engine-agnostic query input text resolution
The controller SHALL resolve query input text using a shared resolver in `ark/internal/resolution` without importing the completions engine package.

#### Scenario: Controller extracts text from user-type query
- **WHEN** a query has `spec.type = "user"` with a plain text input
- **THEN** the controller calls `resolution.ResolveQueryInputText`
- **AND** the resolved text matches the query's input string

#### Scenario: Controller extracts text from messages-type query
- **WHEN** a query has `spec.type = "messages"` with a JSON message array
- **THEN** the resolver extracts the first user message text from the JSON without importing OpenAI types
- **AND** the resolved text matches the user message content

#### Scenario: Controller resolves template parameters
- **WHEN** a query has input with template variables and parameter references (inline, ConfigMap, Secret)
- **THEN** the resolver resolves all parameter values and applies template substitution
- **AND** the result matches the fully resolved input string

### Requirement: Shared ConfigMap/Secret resolution
ConfigMap and Secret key resolution SHALL be provided by shared helpers callable from both the controller resolver and the completions engine.

#### Scenario: Both paths resolve ConfigMap values identically
- **WHEN** a parameter references a ConfigMap key
- **THEN** `resolution.ResolveFromConfigMap` returns the same value regardless of whether it is called from the controller or completions path
