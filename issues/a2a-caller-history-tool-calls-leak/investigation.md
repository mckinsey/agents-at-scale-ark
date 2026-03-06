# Investigation: Solution Analysis

## Approach A: Revert to Empty History (Match Main Exactly)

**Change**: Replace `GetDelegationCallerHistory(ctx)` with `[]protocol.Message{}` in both `AgentToolExecutor.Execute` and `TeamToolExecutor.Execute`.

**Pros**:
- Simplest fix — removes the problematic history entirely
- Exact parity with main's behavior
- Zero risk of leaking internal messages

**Cons**:
- Loses conversational context for delegated agents
- The `WithDelegationCallerHistory`/`GetDelegationCallerHistory` infrastructure becomes dead code
- PR #1244 reviewer explicitly stated "supporting history in teams is necessary"
- Regression from the stated design intent of A2A branch

**Verdict**: Too regressive. The A2A branch was designed to improve on main's empty-history approach.

---

## Approach B: Filter callerHistory at the Delegation Boundary

**Change**: In `A2ALocalEngine.executeA2AToolCalls`, filter `callerHistory` before storing it in context — strip messages containing `ToolCallsPayloadV1` or `ToolResultPayloadV1` data parts.

**Pros**:
- Preserves conversational content (system prompts, user messages, plain assistant responses)
- Removes only internal execution machinery (tool_call/tool_result messages)
- Delegated agents get meaningful context without broken state
- Minimal code change (filter function + apply at one point)
- The `callerHistory` concept remains useful

**Cons**:
- Filtering at the engine level means ALL delegated agents lose tool call context
- A delegated agent can never see what tools its caller invoked (may be useful for debugging)
- Filtering by schema payload requires JSON deserialization per message part

**Analysis of callerHistory composition at the point of delegation**:

When `executeA2AToolCalls` is called, `agentMessages` contains:
1. System messages (coordinator prompt, selector template) — **KEEP**
2. User messages (original query) — **KEEP**
3. `assistant(tool_calls)` messages (coordinator's decisions) — **STRIP**
4. Plain assistant messages (coordinator's final text responses) — **KEEP**

Note: tool RESULT messages are NOT in `agentMessages` at all (they're in `toolOutcomes`). So only `assistant(tool_calls)` messages need stripping. But for safety, both should be filtered.

**Verdict**: Good balance. Clean, targeted, minimal risk.

---

## Approach C: Append Tool Outcomes to agentMessages (Match Main's Architecture)

**Change**: Modify `A2ALocalEngine.Execute` to append tool result messages to `agentMessages` after executing tool calls, like main's `executeToolCalls` does.

**Pros**:
- Makes `agentMessages` self-contained (assistant+tool pairs always present)
- `ensureAssistantToolCallsArePaired` would find the results inline
- Closer to main's architectural pattern

**Cons**:
- The `A2ATurn` interface takes `toolOutcomes` as a separate parameter — the adapter currently expects to receive outcomes separately and cache them for pairing
- Would require adapter changes to handle both inline and outcome-based tool results
- Risk of double-counting tool results (once inline, once via outcomes)
- Bigger refactor that touches the adapter's core message assembly logic

**Verdict**: Higher risk, larger change. The A2A engine's architecture intentionally separates messages from outcomes for a reason (A2A protocol semantics).

---

## Approach D: Make ensureAssistantToolCallsArePaired Strip Unpaired Tool Calls

**Change**: When `ensureAssistantToolCallsArePaired` encounters an assistant message with tool_calls that can't be paired (no explicit tool messages following, no cached outcomes), strip the tool_calls from the assistant message rather than leaving them unpaired.

**Pros**:
- Defensive — handles any source of unpaired tool calls
- No changes needed at the engine or delegation boundary
- Works for both history propagation and any other edge case

**Cons**:
- Masks the symptom rather than fixing the cause
- The assistant message loses information (tool_calls removed)
- Could hide legitimate bugs where outcomes should have been cached
- Harder to debug — silent data loss

**Verdict**: Too defensive. Masks the real problem.

---

## Approach E: Hybrid — Filter at Boundary + Append Results to agentMessages

**Change**: 
1. Convert tool outcomes to A2A messages and append them to `agentMessages` after each tool execution round
2. Filter `callerHistory` to remove tool_call/result messages at delegation boundary

Both changes together make the system robust:
- `agentMessages` is self-consistent (paired tool calls/results)
- Delegated agents get clean history (no leaked internals)
- The adapter's `ensureAssistantToolCallsArePaired` becomes defense-in-depth rather than the primary mechanism

**Analysis**: This is more invasive than B alone, and the tool-result-appending (step 1) isn't strictly necessary if we filter at the boundary. However, it makes `agentMessages` more correct as a conversation transcript.

**Verdict**: Over-engineered for the immediate problem. B alone is sufficient and less risky.

---

## Recommended Approach: B (Filter at Delegation Boundary)

### Rationale

1. **Minimal surface area**: One new function, one call site
2. **Preserves intent**: Delegated agents still get conversational context
3. **Matches the semantic boundary**: Internal tool orchestration is the caller's business, not the child's
4. **Testable**: Simple unit test with known message types
5. **Safe**: Cannot introduce new API validation errors (only removes messages, never adds)

### Implementation Plan

1. Add `filterCallerHistoryForDelegation(messages []protocol.Message) []protocol.Message` to `a2a_local_engine.go`
2. Add helper functions `messageContainsToolCallPayload` and `messageContainsToolResultPayload`
3. Apply filter in `executeA2AToolCalls` before `WithDelegationCallerHistory`
4. Add unit tests for:
   - Filter strips tool_call and tool_result messages
   - Filter preserves system, user, and plain assistant messages
   - Filter handles empty/nil input
   - Integration: delegated agent receives clean history
5. Run full genai test suite
6. Deploy to DevSpace and verify selector team succeeds
7. Capture evidence (logs, screenshots)

### Open Questions

1. Should the `ToolResultPayloadV1` check also cover `StepEventPayloadV1` messages? These are step metadata payloads that might also be internal.
2. Should the filter be applied in `agent_tools.go` (at consumption) rather than `a2a_local_engine.go` (at production)? The engine is the right place because it controls what goes into the context, but the consumer could also defend itself.
3. Should we add a `WithFilteredDelegationCallerHistory` helper that combines the two operations?
