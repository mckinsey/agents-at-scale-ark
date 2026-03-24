## MODIFIED Requirements

### Requirement: Controller response processing independence
The controller SHALL process executor responses without importing or constructing `completions.Message` type structures.

#### Scenario: Executor provides messages via metadata
- **WHEN** the executor's A2A response includes `MessagesRaw` in `QueryExtensionMetadataKey` metadata
- **THEN** the controller writes the value directly to `response.raw` as opaque bytes
- **AND** no `completions.Message` type deserialization or reconstruction occurs in the controller

#### Scenario: Executor does not provide messages metadata (fallback)
- **WHEN** the executor's A2A response does not include `MessagesRaw` in metadata
- **THEN** the controller builds a minimal fallback JSON from response text using `buildFallbackRaw`
- **AND** the fallback produces `[{"role":"assistant","content":"<text>"}]` without importing completions types

## ADDED Requirements

### Requirement: Executor metadata reliability
The completions handler SHALL reliably populate `messages` metadata in A2A responses.

#### Scenario: Completions handler builds A2A response
- **WHEN** the completions handler constructs an A2A response from execution results
- **THEN** it includes serialized OpenAI-compatible messages under `QueryExtensionMetadataKey`
- **AND** the controller's fallback path is exercised only when the executor is not the completions engine
