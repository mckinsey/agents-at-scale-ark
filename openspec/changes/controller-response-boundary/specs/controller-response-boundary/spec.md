## MODIFIED Requirements

### Requirement: Controller response processing independence
The controller SHALL process executor responses without importing or constructing OpenAI-typed message structures.

#### Scenario: Executor provides legacy messages metadata
- **WHEN** the executor's A2A response includes `messages` metadata (OpenAI-compatible JSON)
- **THEN** the controller writes the value directly to `response.raw` as opaque bytes
- **AND** no OpenAI type deserialization or reconstruction occurs in the controller

#### Scenario: Executor does not provide messages metadata
- **WHEN** the executor's A2A response does not include `messages` metadata
- **THEN** the controller builds a minimal fallback JSON from protocol message text parts using `buildFallbackRaw`
- **AND** no OpenAI types are referenced in the fallback construction

#### Scenario: Protocol-native response messages present
- **WHEN** the executor's A2A response includes `responseMessagesV1`
- **THEN** the controller records its presence in the query status
- **AND** the controller does not convert or inspect the protocol message contents

## ADDED Requirements

### Requirement: Dual-write response format at executor boundary
The completions handler SHALL produce both legacy and protocol-native response formats.

#### Scenario: Completions handler builds A2A response
- **WHEN** the completions handler constructs an A2A response from execution results
- **THEN** it populates both `messages` metadata (OpenAI-compatible JSON) and `responseMessagesV1` (protocol-native messages with DataParts)

### Requirement: Metadata merge from multiple sources
The controller SHALL merge metadata from both legacy and A2A extension sources.

#### Scenario: Both metadata sources populated
- **WHEN** an executor response contains both `QueryExtensionMetadataKey` and `ExecutionContextExtensionURI`
- **THEN** the controller merges both into a single payload map
- **AND** extension-sourced values take precedence on key conflicts
