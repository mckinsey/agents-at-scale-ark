## 1. Shared A2A helpers

- [ ] 1.1 `IsNamedEngine` and `ResolveExecutionEngineAddress` in `ark/internal/a2a/engine.go`
- [ ] 1.2 `QueryExtensionRef`/`QueryExtensionTarget`, `NewQueryExtensionMessage`, `SendQueryExtensionMessage` in `ark/internal/a2a/query_extension.go`
- [ ] 1.3 Export `ExtractResponseFromMessageResult`
- [ ] 1.4 Refactor `sendQueryA2A` and `resolveDispatchAddress` onto the helpers
- [ ] 1.5 Adopt `IsNamedEngine` at all five duplicated call sites
- [ ] 1.6 Name `input-required` explicitly in `ExtractTextFromTask`, so both A2A transports report unsupported HITL rather than a generic protocol error
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



## 7. Python SDK

- [ ] 7.1 `QueryTargetRef`; `QueryRef.target`; parse and validate in `extract_query_ref`
- [ ] 7.2 Thread the override through `resolve_query`, with the version floor in the rejection message
- [ ] 7.3 Skip broker and status updater for sub-target invocations



## 8. Tests

- [ ] 8.1 Byte-equality against the legacy metadata literal; target, extensions, contextID
- [ ] 8.2 `IsNamedEngine` table; `ResolveExecutionEngineAddress` against a fake client
- [ ] 8.3 `NamedExecutionEngine` wire format and errors; `executeAgent` routing; recursion guard
- [ ] 8.4 `renderEngineInput` including the system-message case
- [ ] 8.5 Selector: exact / case-insensitive / whole-name / ambiguous / no-match; termination with and without payload; custom terminate prompt
- [ ] 8.6 Sub-target: input source, Noop memory, nil stream, resumption exclusion
- [ ] 8.7 `MakeTeam` with an engine member and no `modelRef`; agent readiness with a missing defaulted Model
- [ ] 8.8 Python: target present/absent/malformed; override resolves a member of a team query; sub-target skips broker and status
- [ ] 8.9 Chainsaw `tests/execution-engine-team/`
- [ ] 8.10 `TestResolveDispatchAddress` passes unmodified through the refactor



## 9. Docs

- [ ] 9.1 Extension schema and README
- [ ] 9.2 `building-execution-engines.mdx` — team membership section
- [ ] 9.3 `query-execution.mdx` and `executionengine.mdx` wording
- [ ] 9.4 `tests/README.md` coverage rows



## 10. Follow-up (not in this change)

- [ ] 10.1 Promote the ark-sdk echo engine to `images/ark-echo-engine/` with `build.mk` and CI wiring, and add chainsaw coverage for the **selector** and **sub-target** paths.
- [ ] 10.2 Marketplace PR: bump the three executor `ark-sdk` pins; gate the Claude scheduler's status writes on `target`
- [ ] 10.3 Deterministic per-`(query, agent)` contextId, so a member reuses its sandbox instead of one per turn
- [ ] 10.4 HITL approval forwarding over A2A
- [ ] 10.5 A2A `message/stream` on the engine path
- [ ] 10.6 Record engine-declared extensions in `ExecutionEngine.status` for pre-flight capability checks
- [ ] 10.7 Revisit `validateNoMixedTeam`
- [ ] 10.8 Have the completions chart inject the engine's own name, so a self-dispatching `executionEngine` can be caught at admission rather than at query time
