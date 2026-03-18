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

### Requirement: Extension capability telemetry governance
Compatibility governance SHALL incorporate extension capability-verifier outcomes as migration evidence.

#### Scenario: Review migration readiness with declaration mismatches
- **WHEN** compatibility governance evaluates readiness for stricter enforcement or adapter retirement
- **THEN** reports include `soft_fail_warn` telemetry for missing extension declarations by URI and target
- **AND** declaration mismatch trends are considered alongside legacy-path traffic metrics

### Requirement: Minimal extension inventory guardrail
Compatibility governance SHALL treat the extension inventory as minimal unless a new semantic-gap decision is approved.

#### Scenario: Propose new extension contract
- **WHEN** a proposal introduces an additional extension for protocol-native transport semantics
- **THEN** it includes documented proof that native A2A semantics are insufficient
- **AND** governance records approval before the inventory is expanded

### Requirement: Verification evidence discipline
Compatibility governance SHALL require explicit validation evidence for staged updates that affect adapter behavior.

#### Scenario: Stage update submitted without parity evidence
- **WHEN** a staged OpenSpec update changes boundary conversion or adapter behavior
- **THEN** parity fixtures and validation evidence are required before the status can move to `decision-accepted`
- **AND** missing evidence blocks promotion decisions

### Requirement: Sequencing dependency guardrail
Gate progression SHALL respect documented dependency order across the protocol-native migration risk chain.

#### Scenario: Out-of-order merge risk
- **WHEN** a change set attempts to promote a later gate while upstream dependency risks remain unresolved
- **THEN** governance marks the promotion as blocked
- **AND** dependency restoration evidence is required before progression
