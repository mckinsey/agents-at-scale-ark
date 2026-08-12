## Context

`Query → Agent` on a named `ExecutionEngine` works; `Query → Team → member` on the same engine fails. The controller and the completions engine each dispatch to engines, but only the controller knows how. The completions engine sends engine-bearing members down the `A2AServer` path, which needs annotations they do not have.

Even with dispatch fixed, the engine cannot tell **which** member to run: the wire payload is only `{name, namespace}`, and the engine derives the agent from `query.spec.target`, which for a team query is the team.

## Goals / Non-Goals

**Goals**

- A `Query → Team → member/selector` on a named engine executes correctly, with members seeing each other's output.
- One dispatch implementation shared by the controller and the completions engine, covering address resolution and message construction. Result handling stays separate by design: the controller turns an `input-required` task into an A2ATask and pauses the Query, which the executor has no way to do.
- No change to any currently-working configuration, guaranteed by construction rather than by care.

**Non-Goals**

- Mixed teams (`validateNoMixedTeam` untouched — it does not block this issue).
- HITL approvals raised on the executor's own outbound A2A hops (sub-target, `executionEngine: a2a`).
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
- **History via `conversationId` + memory** — intra-run team messages are not persisted until the query ends, so there would be nothing to read; and the Claude scheduler shares one sandbox across every member that passes the same contextId, which is the defect Decision 7 addresses.

That leaves the text. Confirmed against the contract: `ExecutionEngineRequest` has `agent`, `userInput` (a *single* `Message`), `mcpServers`, `conversationId`, `query_annotations`, `execution_engine_annotations`, `message_ttl_seconds` — **no history field at all**. Adding one would change the contract for every executor in the marketplace.

### 4. Recursion guard is context-based, not name-based

An Agent with `spec.executionEngine.name` pointing at a completions engine would otherwise dispatch completions → completions forever.

The guard marks sub-target invocations in the context and executes locally instead of re-dispatching. This is name-independent, needs no self-identity knowledge the executor does not have (no engine-name env var exists in the completions chart), and bounds every chain at one extra hop. Semantically it is exactly right: an engine asked to run agent X runs X rather than delegating again.

`MakeAgent` and `executeAgent` share the same predicate (`dispatchesToEngine`) so model loading and execution routing cannot disagree.

This rests on one invariant worth naming: the executor stamps `target` on its own outbound dispatch even though the controller does not (Decision 2). A top-level Query on a self-dispatching agent therefore arrives with no target and dispatches once, then returns to the engine *with* a target — hop two runs locally and the chain ends. Remove that stamp and the guard silently becomes the infinite loop it exists to prevent. A unit table over `dispatchesToEngine` cannot catch that: it drives the predicate from a synthetic context and never sees what the executor puts on the wire. The stamp has to be asserted on the outbound message itself (8.3), and 10.8 (chart injects the engine's own name) is the admission-time backstop.

### 5. A sub-target must not touch the parent Query — enforced structurally

There are four memory write paths, a broker stream, a status updater and an approval-resumption check, all keyed off the parent Query. Gating each one is N chances to miss the N+1th.

Instead a sub-target is handed `NoopMemory` and a nil event stream at setup, which neutralises every write and publish path at once, plus an explicit exclusion from resumption. The Python SDK enforces the same contract by skipping broker discovery and leaving the status updater unset.

### 6. Engine-backed selectors match on reply text

The `select-next-speaker` and `terminate` tools are registered at runtime on a local `ToolRegistry` and can never reach an out-of-process engine, so text is the only viable mechanism.

**Selection.** Try in order: exact match → case-insensitive match → a single candidate appearing as a whole name.

```
NAME_CHAR = [A-Za-z0-9-]     # hyphen is legal in a resource name; a dot is not treated as one

containsWholeName(haystack, needle):          # both already lowercased
  for each index i where haystack[i:] starts with needle:
    before_ok = (i == 0) or haystack[i-1] not in NAME_CHAR
    after_ok  = (i + len(needle) == len(haystack)) or haystack[i + len(needle)] not in NAME_CHAR
    if before_ok and after_ok: return true
  return false
```

Raw substring matching would select a member called `ana` from the word `analysis`. Hyphen is a name character, so `agent` does not match inside `agent-2`. A dot is not, so `analyst.` at the end of a sentence still matches `analyst` — sentence punctuation is far more common in a reply than a dotted agent name would be.

This is expressible as a regex only with lookaround (`(?<![A-Za-z0-9-])name(?![A-Za-z0-9-])`), which Go's RE2 engine does not support. Consuming the boundary characters instead mis-handles adjacent occurrences, hence the scan.

If more than one candidate matches, discard any that is a substring of another match; if exactly one remains it wins, otherwise the selection is ambiguous and fails.

**Termination.**

```
SEPARATOR = [: \t\n\r]       # NOT hyphen or dot: both are legal in a resource name

parseTerminate(reply):
  s = trim(reply)
  if s does not start with "TERMINATE" (case-insensitive): return (none, false)
  rest = s[len("TERMINATE"):]
  if rest == "":               return ("", true)        # bare token, no closing response
  if rest[0] not in SEPARATOR: return (none, false)     # e.g. "terminate-agent" is a member name
  return (trim(trimLeft(rest, SEPARATOR)), true)        # closing response
```

Accepted forms are `TERMINATE`, `TERMINATE: text` and `TERMINATE text`. A member called `terminate-agent` remains selectable. The closing response, not the token, is what reaches the user.

Deliberately **no new admission rejection**: with text matching, engine-backed selectors work, so rejecting them would reject valid configurations.

### 7. Per-member conversation scope in metadata, not on `contextId`

Forwarding the parent conversation to every member gives an engine that keys its own state on it one conversation for the whole team. Marketplace langchain seeds the system prompt only when a history bucket is created, so member B inherits A's persona and turns; claude-agent-sdk derives `session_dir` from the value and then resumes the previous session, so B resumes A's Claude session.

The defect is a shared **persona**, not shared memory. Team context is delivered in band: `Team.executeMember` passes the accumulated transcript to every member and `renderEngineHistory` renders it with `# <member>:` attribution (Decision 3). Local members already show the intended shape — each gets its own system prompt, then the shared history. Only the engine path merges identities, so scoping per member restores the local semantics and takes nothing away.

**Rejected: a derived, v4-shaped `contextId`.** The obstacle is not the scheduler's `_is_valid_uuid4` check but the branch after it:

```python
else:                                          # is_new == False
    info = await sandbox_manager.get_sandbox(conversation_id)
    if info is None:
        return Response(_jsonrpc_error(request_id, -32001,
                        "Session not found or expired"), status_code=404)
```

`extract_context_id` sets `is_new=True` only when `contextId` is missing or empty, so **any** value Ark sends — deterministic, random, correctly v4-shaped — takes the `else` branch, misses, and 404s. Scheduler-mode teams would fail outright where today they merely share a sandbox. Every "derive a contextId" variant therefore needs a companion marketplace change; none is self-contained.

It is also semantically wrong here: the transcript is re-sent in full on every member call, so a member with a stable engine-side session would receive turn 1 twice.

**Chosen:** carry the scope in the extension metadata and let the SDK surface it as `request.conversationId`. Base is `contextId` when non-empty, else `<namespace>/<query>`, combined with the agent name under SHA-256 and hex-encoded to 16 bytes — the claude executor uses the value as a directory name, so it must be path-safe, which rules out a readable `ns/name#agent` form. The derived value is added to the `ExecutionEngineExecution` event data, which is the only debuggability the hash costs.

The wire `contextId` is untouched, so the scheduler behaves exactly as today, and both marketplace executors are fixed by the ark-sdk bump already required for `target` — no marketplace code change and no new version floor.

No sub-target gate is needed: `Execute` stamps `target` unconditionally and the controller dispatches top-level agent-on-engine queries directly, so completions is never in that path. Decision 2 holds unchanged.

**Measured, not assumed (2026-08-12).** `a2a-sdk`'s `RequestContext._check_or_generate_context_id` mints a UUID4 into `message.context_id` whenever the caller sends none, and completions sends an empty `contextId` unless the `a2a-context-id` annotation is set. So before this change every member call reached a standalone executor under a *fresh random* conversation — the validation volume held 32 UUID session directories, none of them shared. Contamination therefore required either a non-empty `contextId` (the A2ATask resumption path) or an executor keying an in-process store on the value, as langchain does; where the value was empty the symptom was per-call churn and no continuity for a member across turns instead. One derivation fixes both. It also means the merged spec's "no `contextId` → empty `conversation_id`" scenario is unreachable over A2A transport, which the MODIFIED delta on that requirement now records.

### 8. Rejected: a child `Query` CRD per member

The most attractive alternative — completions could create a Query with `spec.target = {agent, member}`, send a plain `{name, namespace}` ref, and **every existing engine would work unchanged**, with no schema change, no SDK change and no version floor.

Rejected because **there is no way to create a Query the controller will not dispatch**. `QueryReconciler.Reconcile` has no opt-out annotation or label, so each child would also be dispatched independently and every member would execute twice. Making it work means adding a reconciler opt-out plus webhook handling — strictly more invasive than one optional metadata field — on top of N Query objects per team run.

### 9. Rejected: controller-side team orchestration

The controller would have to reimplement strategies, turn accounting, transcript accumulation, memory and streaming, all of which live in completions by design — and `query-execution.mdx` already specifies recursive routing *from* completions.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| A future edit changes the top-level payload and silently breaks older engines | Byte-equality test against the legacy `map[string]string` literal |
| The refactor changes dispatch address resolution | `TestResolveDispatchAddress` must pass **unmodified** |
| Engine members behave differently from local ones | Documented in `building-execution-engines.mdx`; mixed teams remain rejected at admission |
| New Ark + old engine, team path | Fails with an explicit version-floor message. Broken → broken, never working → broken |
| Text-based selection is fuzzier than a tool call | Whole-name boundary matching; ambiguity falls through to the existing `InvalidAgentError` |
| A future edit merges members back into one conversation | Wire assertions that two members differ and that one member is stable, plus that `contextId` is forwarded untouched (8.11) |
| The scope is a hash, so it is opaque when debugging an engine's state | Recorded in the `ExecutionEngineExecution` event data alongside the engine address |

## Migration

None. No CRD, API type or chart changes. Existing single-agent, built-in-team and A2AServer configurations are untouched.

Users who worked around the issue by hand-adding `ark.mckinsey.com/a2a-server-address` to engine-backed agents should remove those annotations and any synthetic `A2AServer`: those agents will now take the engine path and resolve the `ExecutionEngine` address instead.
