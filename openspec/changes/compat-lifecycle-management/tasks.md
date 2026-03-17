# Compatibility Lifecycle Management Tasks

## 1. Adapter inventory

- [ ] 1.1 Audit all adapters introduced in steps 1–4 and create an inventory (adapter name, file, introduction step, retirement condition)
- [ ] 1.2 Apply `_compat` / `Compat` naming convention where not already present
- [ ] 1.3 Add traceability doc comments to each adapter referencing its migration step

## 2. Parity verification tests

- [ ] 2.1 Create parity test suite for response path adapters (step 1b: `buildFallbackRaw` vs. protocol-native)
- [ ] 2.2 Create parity test suite for input path adapters (step 2: `GetInputMessages` vs. `GetProtocolInputMessages`)
- [ ] 2.3 Create parity test suite for memory adapters (step 4b: cross-method store/retrieve equivalence)
- [ ] 2.4 Create parity test suite for agent/team adapters (step 4a: `TeamMember` vs. `ProtocolTeamMember` dispatch equivalence)
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
