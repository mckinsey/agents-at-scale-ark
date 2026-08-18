# Execution Engine Team Test

Tests a sequential Team whose members all run on a named `ExecutionEngine`.

## What it tests

- A Team member with `spec.executionEngine.name` is dispatched to the engine's resolved address over A2A, rather than being funnelled into the A2AServer path
- The completions executor carries the Ark query extension on member calls
- An engine-backed agent needs no `modelRef` — it never runs the local agentic loop
- A Query targeting the team reaches `phase: done` with a non-empty response

## Resources created

- `mock-engine` ExecutionEngine, pointed at the `mock-llm-echo` A2AServer address
- `engine-member-a` / `engine-member-b` Agents on `mock-engine`, with no `modelRef`
- `engine-team` sequential Team
- `engine-team-query` Query targeting the team

## Not covered

The echo endpoint ignores extension metadata, so this proves dispatch and the
wire format but not that an engine *reads* the `target` field. That half is
covered by the ark-sdk unit tests; a true end-to-end needs an ark-sdk-based
echo-engine image.
