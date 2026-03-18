# Compatibility Lifecycle Management Tasks

## 1. Adapter inventory

- [ ] 1.1 Audit all adapters introduced in Steps 2–8 and create an inventory (adapter name, file, introduction step, retirement condition)
- [ ] 1.2 Apply `_compat` / `Compat` naming convention where not already present
- [ ] 1.3 Add traceability doc comments to each adapter referencing its migration step

## 2. Parity verification tests

- [ ] 2.1 Create parity test suite for response path adapters (Step 3: `buildFallbackRaw` vs. protocol-native)
- [ ] 2.2 Create parity test suite for input path adapters (Step 4: `GetInputMessages` vs. `GetProtocolInputMessages`)
- [ ] 2.3 Create parity test suite for memory adapters (Step 7: cross-method store/retrieve equivalence)
- [ ] 2.4 Create parity test suite for agent/team adapters (Step 6: `TeamMember` vs. `ProtocolTeamMember` dispatch equivalence)
- [ ] 2.5 Tag all parity tests with `//go:build parity` for selective execution

## 3. Mixed-deployment testing matrix

- [ ] 3.1 Document the full deployment combination matrix
- [ ] 3.2 Implement e2e test configurations for key combinations: new+new, old+old, new controller + old executor
- [ ] 3.3 Add CI job or manual verification checklist for matrix testing during releases

## 4. Retirement criteria documentation

- [ ] 4.1 Define retirement criteria template (telemetry thresholds, version windows, deprecation notice)
- [ ] 4.2 Apply template to each adapter in the inventory
- [ ] 4.3 Add basic adapter path telemetry (counter metrics for legacy vs. protocol path usage)

## 5. Ongoing governance

- [ ] 5.1 Add adapter inventory to release checklist
- [ ] 5.2 Document process for introducing new adapters in future steps

## 6. Extension capability governance signals

- [ ] 6.1 Add capability-verifier `soft_fail_warn` metrics to compatibility governance dashboard/reports
- [ ] 6.2 Include missing extension declaration trend checks in retirement-readiness template
- [ ] 6.3 Document minimal extension inventory guardrail and expansion approval path

## 7. Risk-tracked actions

- [ ] 7.1 Define dual-emit retirement readiness signal: telemetry threshold and consumer migration evidence required before reducing dual-emit traffic (risk: Bandwidth overhead)
- [ ] 7.2 Codify which governance checks run per-PR (compatibility contract, parity tests, round-trip tests) vs per-release (mixed-deployment matrix validation, dependency-order evidence) (risk: Governance overhead)
- [ ] 7.3 Lock mandatory retirement telemetry fields (`query.namespace`, `required_extension_uri`, `declared_in_agent_card`, adapter path usage counters) and document schema before any retirement proposal (risk: Criteria ambiguity)
- [ ] 7.4 Define `soft_fail_warn` escalation threshold: at what mismatch rate or trend hard enforcement activates for specific URIs
