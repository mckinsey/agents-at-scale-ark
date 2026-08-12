## 1. Shared A2A helpers

- [ ] 1.1 `IsNamedEngine` and `ResolveExecutionEngineAddress` in `ark/internal/a2a/engine.go`
- [ ] 1.2 `QueryExtensionRef`/`QueryExtensionTarget`, `NewQueryExtensionMessage`, `SendQueryExtensionMessage` in `ark/internal/a2a/query_extension.go`
- [ ] 1.3 Export `ExtractResponseFromMessageResult` for the executor's sub-target path. **Not** for `sendQueryA2A`: on a `*protocol.Task` the helper calls `ExtractTextFromTask` first and returns on its error, so `HandleA2ATaskResponse` is reached only when the task state is `completed` — `input-required` and `failed` both bail before it
- [ ] 1.4 Refactor `sendQueryA2A` and `resolveDispatchAddress` onto the helpers — address resolution and message construction only. Its `*protocol.Task` → `statusInputRequired` branch stays as it is: that branch is what turns a tool-approval pause into an A2ATask plus a Query in phase `input-required`. Routing the result through `ExtractResponseFromMessageResult` instead would surface every approval pause as an error and fail the query
- [ ] 1.5 Adopt `IsNamedEngine` at all five duplicated call sites
- [ ] 1.6 Name `input-required` explicitly in `ExtractTextFromTask`, so both of the executor's outbound A2A hops report unsupported HITL rather than a generic protocol error. Only reachable from the two `ExtractResponseFromMessageResult` callers (`a2a.go`, `execution_engine.go`) — `sendQueryA2A` does not route through it, so the controller's A2ATask approval flow is unaffected
- [ ] 1.7 Return a real recorder from the noop eventing provider's `A2aRecorder()`, which is `nil` today while both A2A paths dereference it unconditionally



## 2. Executor-side dispatch

- [ ] 2.1 `NamedExecutionEngine` in `ark/executors/completions/execution_engine.go`
- [ ] 2.2 Branch `executeAgent` on `IsNamedEngine`, leaving the reserved `"a2a"` path untouched
- [ ] 2.3 `renderEngineInput` folds the team transcript into the member's input
- [ ] 2.4 `renderEngineHistory` renders system messages, which `buildHistory` drops — a selector's entire prompt arrives as one
- [ ] 2.5 Recursion guard: an inbound sub-target agent runs locally



## 3. Sub-target contract (receiving side)

- [ ] 3.1 Input taken from the inbound A2A message, not the Query's own input
- [ ] 3.2 `NoopMemory` substituted, neutralising all four parent-memory write paths and the read
- [ ] 3.3 No broker stream created, so no chunk publishing or stream finalisation
- [ ] 3.4 Excluded from HITL resumption, which is keyed off the parent Query's A2A task
- [ ] 3.5 Unmarshal the inbound payload into the shared `QueryExtensionRef` rather than re-declaring it, retiring the receive-side `arkMetadata`/`queryRef`/`metadataTarget` types so the wire contract is defined once
- [ ] 3.6 Refuse a tool approval raised inside a sub-target at the point of origin, naming the agent and tool, rather than encoding it as a task carrying the parent's conversation for the caller to reject



## 4. Engine-backed selectors

- [ ] 4.1 `GetExecutionEngine()` on `SelectorAgentInterface`
- [ ] 4.2 Skip tool registration; match the reply against candidates
- [ ] 4.3 Whole-name boundary matching, so `ana` does not match inside `analysis`
- [ ] 4.4 `TERMINATE` token with optional closing response; hyphen is not a separator, so `terminate-agent` stays selectable
- [ ] 4.5 The terminate payload, not the raw token, reaches the transcript and final query status
- [ ] 4.6 A configured `spec.selector.terminatePrompt` is honoured; only the mechanism sentence differs for engines
- [ ] 4.7 No new admission rejection for engine-backed selectors



## 5. Model loading and readiness

- [ ] 5.1 Skip model loading for agents dispatched over A2A
- [ ] 5.2 Stop reporting engine-backed agents unavailable for the `modelRef` the webhook defaults onto them
- [ ] 5.3 Explain the model requirement when an agent is pinned local by the recursion guard



## 6. Protocol

- [ ] 6.1 Optional `target` in `ark/api/extensions/query/v1/schema.json`
- [ ] 6.2 Document `target`, fallback semantics and the sub-target contract in the extension README
- [ ] 6.3 Correct the `X-A2A-Extensions` header in the Wire Format block — nothing sets it; `message.extensions` is what is sent
- [ ] 6.4 Optional `conversationId` in the schema, `omitempty` on `QueryExtensionRef` so the top-level payload stays byte-identical (Decision 2), and a README section stating that team context arrives in the message body rather than through this field
- [ ] 6.5 Derive it per member in `NamedExecutionEngine.Execute` — SHA-256 over `<base>\x00<agent>`, hex to 16 bytes, base `contextId` or `<namespace>/<query>`; add it to the `ExecutionEngineExecution` event data. Leave the `contextId` argument untouched



## 7. Python SDK

- [ ] 7.1 `QueryTargetRef`; `QueryRef.target`; parse and validate in `extract_query_ref`
- [ ] 7.2 Thread the override through `resolve_query`, with the version floor in the rejection message
- [ ] 7.3 Skip broker and status updater for sub-target invocations
- [ ] 7.4 `QueryRef.conversation_id`, parsed and type-checked in `extract_query_ref` as `target` is
- [ ] 7.5 Prefer it over `message.context_id` in `_do_execute`, falling back when absent. The broker is built only when there is no `target`, so `BrokerClient(session_id=…)` keeps keying on `context_id`



## 8. Tests

- [ ] 8.1 Byte-equality against the legacy metadata literal; target, extensions, contextID
- [ ] 8.2 `IsNamedEngine` table; `ResolveExecutionEngineAddress` against a fake client
- [ ] 8.3 `NamedExecutionEngine` wire format and errors; `executeAgent` routing; recursion guard. The wire-format assertion must include `target.name` equal to the dispatched agent: that stamp is the only thing that makes hop two run locally, so a predicate test alone leaves the loop unguarded (Decision 4)
- [ ] 8.4 `renderEngineInput` including the system-message case
- [ ] 8.5 Selector: exact / case-insensitive / whole-name / ambiguous / no-match; termination with and without payload; custom terminate prompt
- [ ] 8.6 Sub-target: input source, Noop memory, nil stream, resumption exclusion
- [ ] 8.7 `MakeTeam` with an engine member and no `modelRef`; agent readiness with a missing defaulted Model
- [ ] 8.8 Python: target present/absent/malformed; override resolves a member of a team query; sub-target skips broker and status
- [ ] 8.9 Chainsaw `tests/execution-engine-team/`
- [ ] 8.10 `TestResolveDispatchAddress` passes unmodified through the refactor
- [ ] 8.11 Conversation scope on the wire: two agents differ, one agent is stable, the value varies with the parent context, and `contextId` is absent-or-verbatim in every case. The byte-equality test of 8.1 must pass **unmodified**
- [ ] 8.12 Python: `conversationId` present / absent / non-string; ref value preferred over `context_id` and falling back when absent; top-level broker session still keyed on `context_id`



## 9. Docs

- [ ] 9.1 Extension schema and README
- [ ] 9.2 `building-execution-engines.mdx` — team membership section
- [ ] 9.3 `query-execution.mdx` and `executionengine.mdx` wording
- [ ] 9.4 `tests/README.md` coverage rows



## 10. Follow-up (not in this change)

- [ ] 10.1 Promote the ark-sdk echo engine to `images/ark-echo-engine/` with `build.mk` and CI wiring, and add chainsaw coverage for the **selector** and **sub-target** paths.
- [ ] 10.2 Marketplace PR: bump the three executor `ark-sdk` pins; gate the Claude scheduler's status writes on `target`. The pin bump also delivers per-member conversation scoping, with no marketplace code change
- [ ] 10.3 Sandbox capacity in scheduler mode: a member gets a fresh sandbox per turn, since `contextId` is unchanged by this change. Reusing one needs the scheduler to accept an Ark-supplied `contextId` it has not seen — today that misses `get_sandbox` and 404s (Decision 7) — so it is a marketplace-side change and **not** a fix for member contamination, which 6.5 handles
- [ ] 10.9 Top-level `contextId` collision: an agent-on-engine Query with no `a2a-context-id` annotation sends an empty `contextId`, so the claude executor shares `SESSIONS_DIR` across unrelated queries. Predates this change and lives in the controller's dispatch path
- [ ] 10.4 Forward an `input-required` approval raised on one of the executor's outbound A2A hops back to the controller that owns the Query, so a sub-target or `executionEngine: a2a` agent can use the A2ATask flow the controller already has
- [ ] 10.5 A2A `message/stream` on the engine path
- [ ] 10.6 Record engine-declared extensions in `ExecutionEngine.status` for pre-flight capability checks
- [ ] 10.7 Revisit `validateNoMixedTeam`
- [ ] 10.8 Have the completions chart inject the engine's own name, so a self-dispatching `executionEngine` can be caught at admission rather than at query time
