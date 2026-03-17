## ADDED Requirements

### Requirement: Adapter inventory and naming
All compatibility adapters SHALL follow a consistent naming convention and be documented in an inventory.

#### Scenario: Adapter discoverability
- **WHEN** a developer searches for compatibility adapters
- **THEN** all adapters are identifiable by `_compat` file suffix or `Compat` type/function prefix
- **AND** each adapter has a doc comment referencing its introduction step and retirement condition

### Requirement: Parity verification
Each adapter SHALL have tests proving output equivalence between the legacy and protocol-native paths.

#### Scenario: Response path parity
- **WHEN** parity tests run for the response path adapter
- **THEN** the legacy `response.raw` output and the protocol-native `responseMessagesV1` output contain equivalent semantic content for identical inputs

#### Scenario: Input path parity
- **WHEN** parity tests run for the input path adapter
- **THEN** `GetInputMessages` and `GetProtocolInputMessages` produce equivalent content for the same stored query input

#### Scenario: Memory path parity
- **WHEN** parity tests run for the memory adapter
- **THEN** messages stored via one method set and retrieved via the other produce equivalent content

### Requirement: Mixed-deployment compatibility
The system SHALL be tested under mixed-deployment conditions combining old and new components.

#### Scenario: New controller with old executor
- **WHEN** a new controller processes responses from an executor that does not emit `responseMessagesV1` or `ProtocolStreamEvent`
- **THEN** the controller falls back to legacy processing paths without errors or data loss

#### Scenario: Old controller with new executor
- **WHEN** an old controller processes responses from an executor that emits both legacy and protocol-native formats
- **THEN** the controller processes the legacy format and ignores unknown protocol-native fields

### Requirement: Retirement criteria
Each adapter SHALL have documented, measurable retirement criteria.

#### Scenario: Adapter retirement decision
- **WHEN** an adapter's retirement is proposed
- **THEN** the following conditions are verified: (a) all supported targets use the protocol-native path by default, (b) legacy path traffic is below the documented threshold for the required observation period, (c) deprecation notice has been published for at least one release cycle
