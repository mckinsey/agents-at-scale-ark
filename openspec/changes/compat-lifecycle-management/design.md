## Context

Steps 1 through 4 each introduce compatibility adapters: dual-write response paths, type conversion bridges, interface adapters, and fallback parsing logic. These adapters are necessary for non-breaking migration. This step defines how they are organized, tested, and eventually retired.

## Goals / Non-Goals

**Goals:**
- Consistent naming and organization for all compatibility adapters
- Parity verification tests proving legacy and protocol paths produce equivalent outputs
- Mixed-deployment test matrix covering key deployment combinations
- Documented retirement criteria with measurable thresholds

**Non-Goals:**
- Implementing new adapters (done in steps 1–4)
- Setting firm removal dates (depends on adoption telemetry)
- Creating migration tooling for external consumers

## Decisions

### 1. Adapter naming and colocating convention

**Decision**: Compatibility adapters are identified by a `_compat` suffix (for files) or `Compat` prefix (for types/functions). Each adapter includes a doc comment referencing the step that introduced it and the retirement condition.

**Rationale**: Consistent naming makes adapters discoverable during audits. The doc comment links ensure traceability to the original migration step.

### 2. Parity verification strategy

**Decision**: Each adapter has a dedicated test suite that runs both the legacy and protocol-native paths with the same inputs and asserts output equivalence. These tests are tagged `//go:build parity` for selective execution.

**Rationale**: Parity tests catch drift between the two paths. Build tags allow running them independently without affecting standard test execution time.

### 3. Mixed-deployment testing matrix

**Decision**: Define test configurations combining: {new controller, old controller} × {new executor, old executor} × {protocol-aware client, legacy client}. Key combinations are tested in e2e tests; the full matrix is documented for manual verification during releases.

**Rationale**: Not all combinations can be automated cost-effectively, but the key diagonal (new+new, old+old, new controller+old executor) covers the most likely deployment states.

### 4. Retirement criteria template

**Decision**: Each adapter's retirement requires: (a) all supported deployment targets run the protocol-native path by default, (b) telemetry shows < 1% traffic through the legacy adapter path for two consecutive release cycles, (c) deprecation notice in release notes for at least one release cycle before removal.

**Rationale**: Measurable criteria prevent premature removal. The two-cycle observation window accounts for staggered rollouts.

## Risks

**[Governance overhead]** — Testing and maintaining adapters adds ongoing cost. Mitigation: the parity tests also serve as regression tests, providing value beyond governance.

**[Criteria ambiguity]** — Telemetry thresholds depend on instrumentation that may not exist yet. Mitigation: the first task includes adding basic adapter path telemetry.
