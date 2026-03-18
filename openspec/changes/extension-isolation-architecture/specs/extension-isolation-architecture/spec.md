## ADDED Requirements

### Requirement: Extension interface contract
Each extension SHALL implement a common `Extension` interface providing URI, metadata key, version, and payload validation.

#### Scenario: Extension registered in registry
- **WHEN** an extension package is imported
- **THEN** it auto-registers via `init()` into the default registry
- **AND** `registry.Get(uri)` returns the extension instance

#### Scenario: Extension validates payload
- **WHEN** `ValidatePayload` is called with a payload
- **THEN** the extension validates it against its schema
- **AND** returns an error for invalid payloads

### Requirement: Central extension registry
A `Registry` type SHALL provide lookup, enumeration, and validation delegation for all registered extensions.

#### Scenario: Registry enumerates registered extensions
- **WHEN** `registry.All()` is called
- **THEN** all registered extensions are returned
- **AND** `registry.URIs()` returns their URI set

#### Scenario: Registry provides Agent Card declarations
- **WHEN** `registry.AgentCardDeclarations()` is called
- **THEN** it returns the extension capability declarations suitable for an Agent Card

### Requirement: Extension isolation from core code
Controller and handler SHALL access extension metadata keys and URIs through the registry, not through direct constant references.

#### Scenario: Controller uses registry for extension lookup
- **WHEN** the controller needs an extension URI or metadata key
- **THEN** it calls `registry.Get(uri)` and reads the returned interface methods
- **AND** no direct import of extension package constants is required

#### Scenario: Handler uses registry for extension lookup
- **WHEN** the handler needs to build or parse extension metadata
- **THEN** it uses `registry.Get(uri)` for metadata key discovery
- **AND** behavior is identical to the previous direct-constant path

### Requirement: External extension adapter
External extensions discovered from Agent Card declarations SHALL participate in the registry via a schema-only adapter.

#### Scenario: External extension registered from Agent Card
- **WHEN** an Agent Card declares an extension URI not built into Ark
- **THEN** an `ExternalExtension` adapter is created from the URI and fetched JSON Schema
- **AND** the adapter is registered in the registry

#### Scenario: External extension schema fetch failure
- **WHEN** schema fetch for an external extension fails or returns invalid JSON Schema
- **THEN** the adapter logs the failure
- **AND** `ValidatePayload` returns an error for that extension
- **AND** dispatch is not blocked (consistent with `soft_fail_warn` policy)

### Requirement: Python SDK extension parity
The Python SDK SHALL provide equivalent extension isolation with a base `Extension` protocol class and `Registry`.

#### Scenario: Python SDK extension registration
- **WHEN** the Python SDK is imported
- **THEN** built-in extensions (`query/v1`, `team-attribution/v1`) are registered
- **AND** `registry.get(uri)` returns the extension instance by its canonical URI

### Requirement: Extension version coexistence
Multiple versions of the same extension SHALL coexist in the registry simultaneously.

#### Scenario: Multiple extension versions registered
- **WHEN** both `query/v1` and a hypothetical `query/v2` are registered
- **THEN** `registry.Get()` returns each by its full URI
- **AND** version negotiation uses Agent Card `capabilities.extensions` declarations

### Requirement: Behavioral no-op migration
The refactor from direct constants to registry lookups SHALL produce no change in observable behavior.

#### Scenario: Existing tests pass after migration
- **WHEN** controller and handler are migrated to registry-based lookups
- **THEN** all existing unit tests and chainsaw e2e tests pass without modification
- **AND** extension URIs and metadata keys resolve to the same values as before
