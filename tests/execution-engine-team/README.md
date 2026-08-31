# Execution Engine Team Test

Tests sequential Teams with engine-backed members: one team where every member is on a
named `ExecutionEngine`, one mixed team pairing an engine-backed member with a local
member on the built-in completions engine, and one team pairing a local member with a
member on the built-in `a2a` engine.

## What it tests

- A Team member with `spec.executionEngine.name` is dispatched to the engine's resolved address over A2A, rather than being funnelled into the A2AServer path
- The completions executor carries the Ark query extension on member calls
- An engine-backed agent needs no `modelRef` — it never runs the local agentic loop
- A mixed team is accepted at admission and both member kinds run in one query
- The engine member's turn reaches the local member through the shared transcript: the mock only returns the passing reply when the local member's request carries an assistant message named `engine-member-a`, which is the name stamped onto the engine member's reply. If propagation breaks, the mock returns `REVIEW-FAILED` and the assertion fails
- A member on the built-in `a2a` engine also receives the transcript: the echo agent returns whatever text it is sent, so `a2a-team-query`'s response is the input that reached it. Asserting it contains the local member's `A2A-TRANSCRIPT-MARKER` and the `# a2a-writer:` attribution proves the transcript was forwarded — the query input carries neither (issue #3224)
- Queries targeting any of the three teams reach `phase: done` with a non-empty response

## Resources created

- `mock-engine` ExecutionEngine, pointed at the `mock-llm-echo` A2AServer address
- `engine-member-a` / `engine-member-b` Agents on `mock-engine`, with no `modelRef`
- `local-reviewer` and `a2a-writer` Agents on the built-in engine, with `modelRef: test-model-mock`
- `engine-team` sequential Team (all engine-backed), `mixed-team` sequential Team (`engine-member-a` then `local-reviewer`), and `a2a-team` sequential Team (`a2a-writer` then `echo-agent`, the Agent the `mock-llm-echo` A2AServer creates)
- `engine-team-query` / `mixed-team-query` / `a2a-team-query` Queries targeting each team

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
