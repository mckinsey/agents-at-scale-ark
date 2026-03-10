# PR #1244 Post-Merge Follow-Ups

**PR**: [#1244](https://github.com/mckinsey/agents-at-scale-ark/pull/1244)  
**Source**: [pr-1244-feedback-inventory.md](./pr-1244-feedback-inventory.md)  
**Purpose**: Track deferred P3/P4 items with explicit risk and completion targets.

## Follow-Up Backlog

| Follow-up ID | Origin | Deferred item | Why deferred | Risk while deferred | Recommended owner | Target milestone |
| --- | --- | --- | --- | --- | --- | --- |
| FUP-001 | INV-005 | Replace `interface{}` edge adapters with typed/generic API | Not a direct correctness blocker for #1244 regression fixes | Runtime type-assertion failures remain possible in future changes | `@drew-foxall` | Next genai refactor sprint |
| FUP-002 | INV-009 | Extract shared helper for memory HTTP post lifecycle | Refactor-only; can be isolated after functional fixes settle | Duplicate paths can drift and cause uneven bug fixes | `@drew-foxall` | Next memory-client maintenance pass |
| FUP-003 | INV-011 | Consolidate duplicate A2A tool definition/call/result types | Requires broader type-contract alignment across files | Ongoing conversion overhead and schema drift risk | `@drew-foxall` | Next type-cleanup iteration |
| FUP-004 | INV-013 | Unify duplicated selector methods via shared history-string path | Refactor scope touches selector internals and warrants dedicated test pass | Duplicate logic increases divergence risk | `@drew-foxall` | Next team-selector hardening cycle |
| FUP-005 | INV-014 | Bound/clear `toolOutcomeByID` cache per turn | Low immediate impact relative to correctness blockers | Map growth risk in long-running sessions | `@drew-foxall` | Next adapter maintenance batch |
| FUP-006 | INV-016 | Split `ExecutionResult` into boundary-safe extension model | Needs broader contract decisions to avoid churn | Mixed concerns in result model continue | `@drew-foxall` | Next execution model design update |
| FUP-007 | INV-017 | Consolidate context keys into single execution-context payload | Cross-cutting change across context helpers and call sites | Additional key sprawl and maintenance complexity | `@drew-foxall` | Next context-utils cleanup |
| FUP-008 | QA-008 | Improve commit message fidelity around `ec12fce3` scope | Non-functional history hygiene item | Reviewer clarity remains lower for historical commit intent | `@drew-foxall` | Next PR narrative maintenance pass |

## Exit Criteria For Follow-Up Closure

- [ ] Each follow-up has a dedicated issue or tracked task linked from this document.
- [ ] Deferred item includes tests for any changed behavior.
- [ ] Item is removed from this list only after merged implementation and verification.

## Notes

- `INV-018` (SonarQube quality gate comment) is informational and is intentionally excluded from follow-up backlog.
- If any deferred item is promoted to merge-critical during review, move it back into the active action plan.
- 2026-03-10 sync: no new deferred items were introduced by Turns 3-4 remediation work; `FUP-001` through `FUP-008` remain the active follow-up set.
