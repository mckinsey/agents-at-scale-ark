# Execution Engine Team Test

Tests sequential Teams with members on a named `ExecutionEngine`: one team where every
member is engine-backed, and one mixed team pairing an engine-backed member with a local
member on the built-in completions engine.

## What it tests

- A Team member with `spec.executionEngine.name` is dispatched to the engine's resolved address over A2A, rather than being funnelled into the A2AServer path
- The completions executor carries the Ark query extension on member calls
- An engine-backed agent needs no `modelRef` — it never runs the local agentic loop
- A mixed team is accepted at admission and both member kinds run in one query, with the local member seeing the engine member's turn in the shared transcript
- Queries targeting either team reach `phase: done` with a non-empty response

## Resources created

- `mock-engine` ExecutionEngine, pointed at the `mock-llm-echo` A2AServer address
- `engine-member-a` / `engine-member-b` Agents on `mock-engine`, with no `modelRef`
- `local-reviewer` Agent on the built-in engine, with `modelRef: test-model-mock`
- `engine-team` sequential Team (all engine-backed) and `mixed-team` sequential Team (`engine-member-a` then `local-reviewer`)
- `engine-team-query` / `mixed-team-query` Queries targeting each team

## Not covered

The echo endpoint ignores extension metadata, so this proves dispatch and the
wire format but not that an engine *reads* the `target` field. That half is
covered by the ark-sdk unit tests; a true end-to-end needs an ark-sdk-based
echo-engine image.

The teams' `Available` condition is not asserted: engine-backed agent availability
requires `ExecutionEngine.Status.Phase == "ready"`, and this test only waits for the
engine's resolved address. Query dispatch does not depend on `Available`.

## Running

```bash
chainsaw test
```

Successful completion validates that engine-backed and local members can run in the same
team.
