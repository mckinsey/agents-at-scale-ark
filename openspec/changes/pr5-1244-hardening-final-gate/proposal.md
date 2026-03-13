# PR5 Hardening and Final Gate

## Why

Before closing internal A2A migration, runtime edge cases must be hardened to avoid regressions in streaming and team execution.

## What Changes

- Add streaming fallback guard to prevent blocking fallback when streaming already emitted chunks.
- Ensure selector history uses stable assistant labeling fallback.
- Enforce nil-result guard in team member accumulation path.
- Execute final focused validation across completions and controller boundaries.

## Impact

- `ark/executors/completions/a2a_execution.go`
- `ark/executors/completions/a2a_execution_test.go`
- `ark/executors/completions/team.go`
- `ark/executors/completions/team_selector.go`
