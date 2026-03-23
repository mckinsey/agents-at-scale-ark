## Context

Teams in Ark orchestrate multiple agents using strategies like sequential, round-robin, selector, and graph. The team loop runs inside the completions executor and accumulates conversation history as `[]completions.Message` (OpenAI-typed). All team members are currently expected to run on the same executor.

As protocol-native executors are introduced, teams need to support mixed membership — some agents on completions, others on different engines. This is a prerequisite for incremental migration without downtime.

## Goals / Non-Goals

**Goals:**
- Understand the feasibility and cost of mixed-team execution
- Identify the minimum viable approach for per-member migration
- Document architectural constraints and open questions

**Non-Goals:**
- Full implementation (this is an exploration spec)
- Changing team strategies or adding new orchestration patterns

## Approach Options

### Option A: Adapters at team boundary

Convert protocol responses to `[]Message` at the point where external members return results. The team loop stays OpenAI-typed internally.

**Pros:** Minimal change to existing team code. In-process members stay fast.
**Cons:** Adapter complexity. Potential lossy conversion for non-OpenAI response structures.

### Option B: Protocol-native team executor

Build a new team executor where the orchestration loop uses `protocol.Message` natively. All members are called via A2A.

**Pros:** Clean separation. No type mixing.
**Cons:** Duplicates orchestration logic. All members become network calls (no in-process optimization).

### Option C: External-only mixed members

Mixed team members are called via A2A network calls. Same-engine members can still run in-process. Conversion happens at the A2A call site.

**Pros:** Uses existing `a2a_execution.go` plumbing. Per-member routing.
**Cons:** Still needs type conversion. Network overhead for some members.

## Decisions

No decisions yet — this spec is exploratory. Next step is prototyping Option C (lowest risk) to assess feasibility.

## Risks

**[Type conversion fidelity]** — Converting between OpenAI messages and A2A protocol messages may be lossy for tool calls, function calls, or structured content.

**[Performance]** — Network calls for members that could run in-process adds latency.

**[Observability]** — Cross-executor team spans need careful trace propagation.
