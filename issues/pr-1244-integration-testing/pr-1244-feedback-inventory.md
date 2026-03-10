# PR #1244 Feedback Inventory (Mar 9, 2026)

**PR**: [feat/a2a-native-execution-main-sync #1244](https://github.com/mckinsey/agents-at-scale-ark/pull/1244)  
**Window**: 2026-03-09 00:00-23:59 UTC  
**Primary reviewer**: `havasik`  
**Owner**: `@drew-foxall`

## Source Scope

- Included sources:
  - PR issue comments posted on Mar 9
  - PR review summaries posted on Mar 9
  - Inline review comments posted on Mar 9
- Excluded from action scope:
  - Prior-day comments except where needed for context
  - Bot comments unless they contain merge-blocking direction

## Canonical Feedback Entries

| ID | Source | Type | Location | Concern | Risk | Suggested action | Disposition | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INV-001 | [issuecomment-4022290805](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#issuecomment-4022290805) | Issue comment | PR-level (team execution, selector, dashboard chat) | Transitivity and selector-history regressions still present; dashboard chat appears broken | High | Restore transitivity and selector history behavior; investigate dashboard chat regression | Do now | `@drew-foxall` |
| INV-002 | [pullrequestreview-3915550776](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#pullrequestreview-3915550776) | Review summary | PR-level | Quick Analysis reports critical/required gaps (compat scope, token assertions, missing e2e coverage, docs hygiene) | High | Decompose into explicit QA-* actions and track in action plan | Do now | `@drew-foxall` |
| INV-003 | [discussion_r2906266062](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266062) | Inline review | `ark/internal/genai/a2a_local_engine.go` | Tool execution errors drop accumulated `A2AMessages` by returning `nil, err` | High | Return partial `ExecutionResult` plus error to preserve partial results | Do now | `@drew-foxall` |
| INV-004 | [discussion_r2906266078](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266078) | Inline review | `ark/internal/genai/openai_a2a_model_adapter.go` | Nil `model` can panic from unconditional dereference | High | Add explicit nil guard or fail-fast contract enforcement | Do now | `@drew-foxall` |
| INV-005 | [discussion_r2906266081](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266081) | Inline review | `ark/internal/genai/edge_adapter.go` | `interface{}` adapters defer type errors to runtime | Medium | Refactor to typed/generic adapter API | Defer | `@drew-foxall` |
| INV-006 | [discussion_r2906266084](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266084) | Inline review | `ark/internal/genai/memory.go` | `MemoryInterface` change is compile-time breaking for out-of-tree implementers | High | Split optional A2A methods into extension interface + type assertion path | Do now | `@drew-foxall` |
| INV-007 | [discussion_r2906266089](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266089) | Inline review | `ark/internal/genai/a2a_execution.go` | `CreateA2AClient` error is swallowed silently | Medium | Emit structured log when client creation fails | Do now | `@drew-foxall` |
| INV-008 | [discussion_r2906266097](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266097) | Inline review | `ark/internal/genai/a2a_execution.go` | Streaming error can trigger blocking fallback and duplicate side effects | High | Avoid fallback after partial streamed execution; propagate contextual error | Do now | `@drew-foxall` |
| INV-009 | [discussion_r2906266098](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266098) | Inline review | `ark/internal/genai/memory_http.go` | `AddA2AMessages` duplicates `AddMessages` HTTP lifecycle code | Medium | Extract shared helper for POST flow | Defer | `@drew-foxall` |
| INV-010 | [discussion_r2906266110](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266110) | Inline review | `ark/internal/genai/memory_http.go` | Non-2xx errors hide response body details | Medium | Include bounded response body snippet in error path | Do now | `@drew-foxall` |
| INV-011 | [discussion_r2906266119](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266119) | Inline review | `ark/internal/genai/a2a_model_provider.go` | Duplicate tool types increase maintenance/conversion burden | Medium | Consolidate via common type or aliases | Defer | `@drew-foxall` |
| INV-012 | [discussion_r2906266121](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266121) | Inline review | `ark/internal/genai/streaming_native.go` | `BuildNativeStreamCompletionEvent` lacks direct unit coverage | High | Add unit tests for nil query, error phase, success with usage data | Do now | `@drew-foxall` |
| INV-013 | [discussion_r2906266126](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266126) | Inline review | `ark/internal/genai/team_selector.go` | A2A selector methods duplicate OpenAI selector methods | Medium | Refactor selector to shared history-string path | Defer | `@drew-foxall` |
| INV-014 | [discussion_r2906266132](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266132) | Inline review | `ark/internal/genai/openai_a2a_model_adapter.go` | `toolOutcomeByID` cache can grow across turns | Low | Clear map per turn or apply bounded lifecycle | Defer | `@drew-foxall` |
| INV-015 | [discussion_r2906266139](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266139) | Inline review | `issues/a2a-caller-history-tool-calls-leak/` | Investigation artifacts should not live in source tree | Medium | Remove directory from PR and move notes to issue/wiki | Do now | `@drew-foxall` |
| INV-016 | [discussion_r2906266144](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266144) | Inline review | `ark/internal/genai/execution_result.go` | `ExecutionResult` mixes compatibility and internal transport concerns | Medium | Split A2A/delegation fields into dedicated extension struct | Defer | `@drew-foxall` |
| INV-017 | [discussion_r2906266148](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#discussion_r2906266148) | Inline review | `ark/internal/genai/context_utils.go` | Context key sprawl (12+ keys) hurts maintainability | Low | Consolidate into one execution-context payload key | Defer | `@drew-foxall` |
| INV-018 | [issuecomment-4027131395](https://github.com/mckinsey/agents-at-scale-ark/pull/1244#issuecomment-4027131395) | Bot issue comment | PR-level quality signal | SonarQube quality gate passed, with issue/coverage metrics | Low | Track separately as informational signal | Reject (no direct code action) | n/a |

## Decomposed Actions From INV-002 (Quick Analysis)

| ID | Source | Concern | Disposition | Rationale |
| --- | --- | --- | --- | --- |
| QA-001 | INV-002 | Compat shims should be handled in this migration PR | Do now | Impacts migration completeness and reviewer confidence |
| QA-002 | INV-002 | `query-token-usage` assertions relaxed from exact to `> 0` | Do now | Can mask propagation regressions |
| QA-003 | INV-002 | Missing e2e coverage for 4 A2A-native team strategies | Do now | Directly tied to regressions reported in INV-001 |
| QA-004 | INV-002 | Missing e2e coverage for A2A-native agent tool path | Do now | New logic in `agent_tools.go` needs end-to-end proof |
| QA-005 | INV-002 | New annotations lack e2e coverage | Do now | Surface-area increase without verification |
| QA-006 | INV-002 | Existing `a2a-*` chainsaw tests may still hit compat path | Do now | Must prove tests exercise native path |
| QA-007 | INV-002 | `issues/a2a-caller-history-tool-calls-leak/` should be removed | Do now | Repository hygiene; overlaps INV-015 |
| QA-008 | INV-002 | Commit message for `ec12fce3` does not match changes | Defer | Non-blocking PR hygiene unless commit rewrite is explicitly required |

## Overlap And Deduplication Map

- `INV-015` and `QA-007` are the same repository-hygiene action. Track once in implementation.
- `INV-001` (selector-history regression) and `INV-013` (selector duplication) touch the same file but are different scopes:
  - `INV-001`: correctness regression (now)
  - `INV-013`: refactor quality (defer)
- `INV-009` and `INV-010` both target `memory_http.go`:
  - `INV-010`: error visibility correctness (now)
  - `INV-009`: structural deduplication (defer)
- `INV-001` and `QA-003/QA-004/QA-006` are linked through evidence requirements. Tests are used to prove regression fixes.

## Disposition Summary

- **Canonical entries (`INV-*`)**: 10 `Do now`, 7 `Defer`, 1 `Reject`
- **Decomposed Quick Analysis entries (`QA-*`)**: 7 `Do now`, 1 `Defer`
- **Dedup note**: `QA-007` overlaps with `INV-015` and should be implemented once.
