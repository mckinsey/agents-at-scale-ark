# PR #1244 Feedback Action Plan

**PR**: [#1244](https://github.com/mckinsey/agents-at-scale-ark/pull/1244)  
**Inventory**: [pr-1244-feedback-inventory.md](./pr-1244-feedback-inventory.md)  
**Owner**: `@drew-foxall`

## Priority Model

- **P1 (merge blockers)**: correctness and user-visible regressions
- **P2 (should fix before merge)**: compatibility, observability, and required test evidence
- **P3 (post-merge refactor)**: structural improvements without immediate correctness impact
- **P4 (post-merge hygiene)**: low-risk cleanup and architecture debt

## P1 - Merge Blockers

| ID | Action | Target file(s) | Validation requirement | Completion criteria |
| --- | --- | --- | --- | --- |
| INV-001 | Resolve team transitivity and selector-history regressions; validate dashboard chat regression | `ark/internal/genai/team.go`, `ark/internal/genai/team_selector.go`, dashboard path under `services/vnext-ui/` as applicable | Focused integration tests for transitivity and selector history; manual dashboard repro check | Team agents see accumulated history, selector chooses from real history context, dashboard chat works for same scenario |
| INV-003 | Preserve partial `A2AMessages` when tool-call execution returns error | `ark/internal/genai/a2a_local_engine.go` | Unit tests that exercise `TerminateTeam` and non-terminate error paths | Error returns include accumulated `A2AMessages` instead of `nil` |
| INV-004 | Add fail-fast handling for nil `model` to prevent panic | `ark/internal/genai/openai_a2a_model_adapter.go` | Unit test for nil model input path | No nil dereference path remains; nil case is explicit and deterministic |
| INV-008 | Prevent duplicate side effects from streamed execution fallback | `ark/internal/genai/a2a_execution.go` | Unit/integration test that simulates streamed partial success plus error | No second full execution when `streamed=true`; error path contains streamed-state context |
| QA-001 | Decide and implement compat-shim scope in migration PR | `ark/internal/genai/agent.go`, `ark/internal/genai/team.go`, related compat helpers | Explicit code-path verification and PR note | Compat behavior is intentionally either fully migrated now or clearly bounded with rationale |

## P2 - Should Fix Before Merge

| ID | Action | Target file(s) | Validation requirement | Completion criteria |
| --- | --- | --- | --- | --- |
| INV-006 | Avoid hard compile break by splitting optional A2A memory interface | `ark/internal/genai/memory.go`, call sites in execution/team flows | Compile-time checks and unit coverage for both interface shapes | Existing `MemoryInterface` consumers continue working; A2A path uses optional extension |
| INV-007 | Surface `CreateA2AClient` setup failures in logs | `ark/internal/genai/a2a_execution.go` | Unit test or log assertion in failure scenario | Failure to create client is observable in logs, not silent |
| INV-010 | Include bounded HTTP response body in memory write errors | `ark/internal/genai/memory_http.go` | Unit test for non-2xx with body | Error includes status and bounded body snippet |
| INV-012 | Add direct tests for `BuildNativeStreamCompletionEvent` | `ark/internal/genai/streaming_native.go`, `ark/internal/genai/streaming_native_test.go` | Tests for nil query, error phase, successful phase with usage | All three scenarios covered and passing |
| INV-015 + QA-007 | Remove `issues/a2a-caller-history-tool-calls-leak/` from PR scope | `issues/a2a-caller-history-tool-calls-leak/` | PR diff review | Directory removed from branch and info moved outside source tree |
| QA-002 | Reinstate deterministic token-usage assertions where exact values are known | Chainsaw tests under `tests/chainsaw/tests/query-token-usage/` | Chainsaw run proves exact propagation still works | Assertions validate expected known values, not only `> 0` |
| QA-003 | Add/extend e2e coverage for A2A-native team strategies | Chainsaw team strategy tests under `tests/chainsaw/tests/` | Chainsaw execution for sequential, round-robin, selector, graph | All four strategies have native-path coverage and passing assertions |
| QA-004 | Add/extend e2e coverage for A2A-native agent tool call path | `ark/internal/genai/agent_tools.go` plus chainsaw/e2e scenario | E2E test demonstrates tool-call flow through native path | Agent tool-call execution is verified end-to-end under native path |
| QA-005 | Add coverage for new A2A annotations | `ark/internal/annotations/annotations.go` and relevant integration tests | E2E or integration assertions on annotation behavior | New annotations are exercised with explicit expected behavior |
| QA-006 | Prove existing `a2a-*` chainsaw tests execute native path, not compat path | Existing `tests/chainsaw/tests/a2a-*` | Runtime assertions/log hooks confirming native route | Test evidence shows native codepath execution |

## P3/P4 - Defer To Post-Merge

| ID | Deferred action | Target file(s) | Risk if deferred |
| --- | --- | --- | --- |
| INV-005 | Replace `interface{}` edge adapters with typed/generic API | `ark/internal/genai/edge_adapter.go` | Runtime type-assertion fragility remains |
| INV-009 | Extract shared memory HTTP post helper | `ark/internal/genai/memory_http.go` | Duplicate code paths can drift |
| INV-011 | Consolidate duplicate A2A tool-related types | `ark/internal/genai/a2a_model_provider.go` and related payload types | Ongoing conversion and maintenance overhead |
| INV-013 | Remove selector method duplication across OpenAI/A2A paths | `ark/internal/genai/team_selector.go` | Higher bug-fix cost across duplicated methods |
| INV-014 | Bound or clear `toolOutcomeByID` lifecycle per turn | `ark/internal/genai/openai_a2a_model_adapter.go` | Long-lived map growth risk |
| INV-016 | Split `ExecutionResult` concerns into extension model | `ark/internal/genai/execution_result.go` | Boundary semantics remain mixed |
| INV-017 | Consolidate execution context keys into one payload | `ark/internal/genai/context_utils.go` | Incremental complexity and cognitive load |
| QA-008 | Improve commit message fidelity for `ec12fce3` context | Git history/PR narrative | Review clarity remains lower |

## Merge Gates

### Gate A: Correctness

- [x] All P1 items completed and validated
- [x] No known user-visible regressions remain in streaming/team/dashboard chat scenarios
- [x] No known panic/duplicate-execution/data-loss paths remain from P1 comments

### Gate B: Required Evidence

- [x] P2 testing items completed (`QA-002` to `QA-006`, `INV-012`)
- [x] Added tests pass in targeted runs
- [x] Existing relevant chainsaw suites pass after updates

### Gate C: Scope Hygiene

- [x] Investigation artifact directory removal done (`INV-015`)
- [x] PR description summarizes addressed feedback and explicitly calls out deferred P3/P4 scope

### Merge Decision Rule

- Merge is blocked if any **P1** item is open.
- Merge is blocked if any **P2 testing/evidence** item is open unless reviewer explicitly accepts deferment in PR discussion.
- Any deferred item must be listed in `pr-1244-post-merge-followups.md` before approval.

## Execution Sequence

1. Complete P1 code-path fixes and validations.
2. Complete P2 evidence and compatibility items.
3. Re-run focused test suites for touched paths.
4. Update PR narrative with disposition summary (`Done now` vs `Deferred`).
5. Move P3/P4 items into post-merge follow-up tracking.
