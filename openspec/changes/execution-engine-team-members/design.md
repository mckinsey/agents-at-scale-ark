## Context

`Query → Agent` on a named `ExecutionEngine` works; `Query → Team → member` on the same engine fails. The controller and the completions engine each dispatch to engines, but only the controller knows how. The completions engine sends engine-bearing members down the `A2AServer` path, which needs annotations they do not have.

Even with dispatch fixed, the engine cannot tell **which** member to run: the wire payload is only `{name, namespace}`, and the engine derives the agent from `query.spec.target`, which for a team query is the team.

## Goals / Non-Goals

**Goals**

- A `Query → Team → member/selector` on a named engine executes correctly, with members seeing each other's output.
- One dispatch implementation shared by the controller and the completions engine.
- No change to any currently-working configuration, guaranteed by construction rather than by care.

**Non-Goals**

- Mixed teams (`validateNoMixedTeam` untouched — it does not block this issue).
- HITL approvals over A2A.
- Streaming on the engine path.
- Marketplace executor changes.

## Decisions

### 1. Optional `target` on the `/ref` payload, not a sibling metadata key

Chosen because it completes the existing `arkMetadata.Target` vestige, and because `/ref` purity is already gone — `buildResponseMeta` emits a different shape under the same key on the response side.

The extension URI is **not** version-bumped: the change is purely additive and receivers on both sides ignore unknown members (Go unmarshals into a narrow struct, Python uses `.get()`).

### 2. The controller sends no `target`

For a top-level dispatch `query.spec.target` is authoritative and every engine version already reads it. With `Target == nil` the metadata marshals to exactly `{"name":…,"namespace":…}` — byte-identical to what shipped before.

**This is the single property that makes Ark-first release ordering safe**, which is why it is pinned by a byte-equality test against the legacy literal rather than assumed.

### 3. Transcript folded into `userInput`, not sent as metadata

Rejected alternatives:

- **History as extension metadata** — the archived change `2026-03-13-standardize-a2a-extensions` deliberately replaced a blob carrying `agent`/`tools`/`history` with a bare QueryRef. Re-adding history reverts a settled decision.
- **History via `conversationId` + memory** — intra-run team messages are not persisted until the query ends, so there would be nothing to read; and the Claude scheduler rejects any non-UUID4 contextId while sharing one sandbox across every member that passes the same one.

That leaves the text. Confirmed against the contract: `ExecutionEngineRequest` has `agent`, `userInput` (a *single* `Message`), `mcpServers`, `conversationId`, `query_annotations`, `execution_engine_annotations`, `message_ttl_seconds` — **no history field at all**. Adding one would change the contract for every executor in the marketplace.

### 4. Recursion guard is context-based, not name-based

An Agent with `spec.executionEngine.name` pointing at a completions engine would otherwise dispatch completions → completions forever.

The guard marks sub-target invocations in the context and executes locally instead of re-dispatching. This is name-independent, needs no self-identity knowledge the executor does not have (no engine-name env var exists in the completions chart), and bounds every chain at one extra hop. Semantically it is exactly right: an engine asked to run agent X runs X rather than delegating again.

`MakeAgent` and `executeAgent` share the same predicate (`dispatchesToEngine`) so model loading and execution routing cannot disagree.

### 5. A sub-target must not touch the parent Query — enforced structurally

There are four memory write paths, a broker stream, a status updater and an approval-resumption check, all keyed off the parent Query. Gating each one is N chances to miss the N+1th.

Instead a sub-target is handed `NoopMemory` and a nil event stream at setup, which neutralises every write and publish path at once, plus an explicit exclusion from resumption. The Python SDK enforces the same contract by skipping broker discovery and leaving the status updater unset.

### 6. Engine-backed selectors match on reply text

The `select-next-speaker` and `terminate` tools are registered at runtime on a local `ToolRegistry` and can never reach an out-of-process engine, so text is the only viable mechanism.

Matching is exact → case-insensitive → a single candidate mentioned as a **whole name**. Boundary matching matters: raw substring matching selects a member called `ana` from the word `analysis`. Hyphen counts as a name character so `agent` does not match inside `agent-2`; a dot does not, so a sentence-ending period still matches.

Termination uses a `TERMINATE` token, optionally followed by a closing response. The token must stand alone or be followed by whitespace or a colon — a hyphen is **not** a separator, because it is legal inside a Kubernetes name and a member called `terminate-agent` must remain selectable.

Deliberately **no new admission rejection**: with text matching, engine-backed selectors work, so rejecting them would reject valid configurations.

### 7. Rejected: a child `Query` CRD per member

The most attractive alternative — completions could create a Query with `spec.target = {agent, member}`, send a plain `{name, namespace}` ref, and **every existing engine would work unchanged**, with no schema change, no SDK change and no version floor.

Rejected because **there is no way to create a Query the controller will not dispatch**. `QueryReconciler.Reconcile` has no opt-out annotation or label, so each child would also be dispatched independently and every member would execute twice. Making it work means adding a reconciler opt-out plus webhook handling — strictly more invasive than one optional metadata field — on top of N Query objects per team run.

### 8. Rejected: controller-side team orchestration

The controller would have to reimplement strategies, turn accounting, transcript accumulation, memory and streaming, all of which live in completions by design — and `query-execution.mdx` already specifies recursive routing *from* completions.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| A future edit changes the top-level payload and silently breaks older engines | Byte-equality test against the legacy `map[string]string` literal |
| The refactor changes dispatch address resolution | `TestResolveDispatchAddress` must pass **unmodified** |
| Engine members behave differently from local ones | Documented in `building-execution-engines.mdx`; mixed teams remain rejected at admission |
| New Ark + old engine, team path | Fails with an explicit version-floor message. Broken → broken, never working → broken |
| Text-based selection is fuzzier than a tool call | Whole-name boundary matching; ambiguity falls through to the existing `InvalidAgentError` |

## Migration

None. No CRD, API type or chart changes. Existing single-agent, built-in-team and A2AServer configurations are untouched.

Users who worked around the issue by hand-adding `ark.mckinsey.com/a2a-server-address` to engine-backed agents should remove those annotations and any synthetic `A2AServer`: those agents will now take the engine path and resolve the `ExecutionEngine` address instead.

## Open Questions

- Should the ExecutionEngine controller record engine-declared extensions in `status`, turning the version-floor failure into a pre-flight condition?
- Should mixed teams be revisited now that the technical justification for rejecting them is weaker?
- Should the completions chart inject the engine's own name, enabling a self-dispatch check at admission rather than at query time?
