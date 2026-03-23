## Why

Teams currently assume all members run on the same executor. `validateNoMixedTeam` in the webhook classifies named-engine agents as external and blocks teams that mix completions agents with external agents. As we introduce protocol-native executors, teams need to support members running on different engines without requiring all-at-once migration.

## Problem Statement

The team orchestration loop in the completions executor accumulates `[]Message` (OpenAI-typed). A member running on a different executor returns A2A protocol messages. These are incompatible types. One of the following must be true:

1. **Adapters at the team boundary** — convert protocol responses to `[]Message` for accumulation in the team loop
2. **Protocol-native team loop** — a new team executor that accumulates `protocol.Message` and delegates to members via A2A
3. **External-only via A2A** — mixed team members are called via A2A network calls (as `a2a_execution.go` already does), with response conversion at the call boundary

## Open Questions

- What is the migration path? Can individual team members be migrated one at a time, or must the entire team move at once?
- Does `validateNoMixedTeam` need relaxation, or should mixed teams use a different mechanism (e.g., all-external via A2A)?
- What happens to team-level tool calls when members use different executors?
- How does the selector strategy work when team members have different response types?
- What is the performance impact of A2A network calls for members that could run in-process?

## What We Know

- `a2a_execution.go` already handles calling external agents via A2A — the plumbing exists
- `validateNoMixedTeam` is a webhook validation rule, not an architectural constraint
- The team loop uses `[]Message` for history accumulation — this is the core type compatibility issue
- `spec.executionEngine` provides per-agent routing — the controller already knows which engine to use

## What We Need to Explore

- Map the exact type conversions needed at the team boundary for each strategy
- Estimate LOC and complexity for each approach
- Prototype a mixed team with one completions agent and one A2A agent to test feasibility
- Determine if the A2A TCK (test compatibility kit) covers team interop scenarios

## Compatibility Contract

TBD — depends on chosen approach. Any solution must:
- Not break existing single-engine teams
- Support incremental migration (preferred) or clearly document all-at-once requirement
- Preserve team-level observability (tracing, token usage aggregation)
