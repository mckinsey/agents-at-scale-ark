## Why

A Query against an Agent on a named `ExecutionEngine` works. The same agents inside a `Team` fail with JSON-RPC `-32603` (issue #3116).

The two paths are separate implementations. The **controller** resolves named engines and attaches the query extension. The **completions engine**, which owns team strategy execution, has no named-engine dispatch at all — every engine-bearing member is funnelled into the `A2AServer` path, which demands annotations only the A2AServer controller writes and sends no extension metadata.

This closes a gap between docs and code rather than adding surface. All three already claim it works:

- `docs/content/reference/query-execution.mdx` — "members with their own execution engine go back through A2A"
- `docs/content/reference/resources/executionengine.mdx` — an engine "executes agents (and teams) via the A2A protocol"
- `openspec/specs/a2a-query-extension/spec.md` — "The completions engine SHALL forward the QueryRef extension when sending A2A messages to named execution engines"

## What Changes

- **One shared dispatch.** `IsNamedEngine`, `ResolveExecutionEngineAddress`, `NewQueryExtensionMessage` and `SendQueryExtensionMessage` move to `internal/a2a`. The controller's `sendQueryA2A` is refactored onto them, so both paths build identical extension metadata by construction rather than by convention.
- **An optional `target` on the QueryRef payload** naming the resource to execute. A team member's Query targets the team, so without it an engine cannot tell which member to run. The controller sends none for a top-level dispatch, keeping those bytes byte-identical.
- **Transcript forwarding.** The accumulated team transcript is folded into the member's input, because the engine contract has no history field and intra-run messages are not persisted until the query completes.
- **A sub-target contract.** An inbound `target` marks a sub-request: run the named agent locally rather than dispatching onwards, take input from the inbound message, and write no parent memory, broker stream, status or approval state. The calling engine owns all of those for the run.
- **Engine-backed selectors** select, and terminate, by reply text — the `select-next-speaker` and `terminate` tools are registered in-process and can never reach an external engine.
- **No model load for agents dispatched over A2A**, and no reporting them unavailable for the `modelRef` the mutating webhook defaults onto them.

## Capabilities

### Modified Capabilities
- `a2a-query-extension`: optional `target` override on the QueryRef payload, the sub-target invocation contract, engine-backed team dispatch, and text-based selection for engine-backed selectors.

## Non-Goals

- **Mixed teams.** `validateNoMixedTeam` is unchanged. It is not what blocks this issue — the reporter's team is all-external, which the guard permits, and it then fails at runtime. Worth revisiting separately.
- **HITL approvals on the executor's outbound A2A hops.** This is scoped to the two hops the completions executor makes itself — an agent with `executionEngine: a2a`, and a named engine handed a sub-target. On those, an `input-required` task is rejected, and always has been. The obstacle is resumption, not the request: the executor can already raise an approval upward (`handleApprovalRequired` returns an `input-required` task and the controller creates the A2ATask), but the resume point it hands over — `ExecutionContext{ConversationID, PendingToolCallIndex, CompletedToolResults, AgentName, AgentNamespace}` — describes one local agent stopped at a tool-call index. Forwarding a peer's approval needs two things it cannot express: a handle to the peer's paused task, so resumption re-enters that task instead of replaying a local tool call, and the executor's position in the team loop, since a sub-target approval happens mid-team. That is a second resume protocol, not an extra field. This change names the limitation clearly instead of surfacing a generic protocol error. **The controller → engine approval flow is untouched and stays supported**: `sendQueryA2A` turns an `input-required` task into an A2ATask and moves the Query to phase `input-required`. Forwarding approvals across the executor's own hops is a feature, tracked as follow-up 10.4 in `tasks.md`.
- **Streaming on the engine path.** Member calls use blocking `message/send`; broker chunks are keyed by query name and would interleave.
- **Marketplace executor changes.** Separate PR, after this releases.

## Impact

- `ark/internal/a2a/` — `engine.go`, `query_extension.go` (new); `ExtractResponseFromMessageResult` exported; `input-required` named explicitly in `ExtractTextFromTask`
- `ark/internal/controller/` — `query_controller.go` refactored onto the helpers; `agent_controller.go` readiness fix
- `ark/executors/completions/` — `execution_engine.go` (new); dispatch, sub-target handling and selector changes
- `ark/api/extensions/query/v1/` — schema and README
- `lib/ark-sdk/.../extensions/query.py`, `executor_app.py` — target resolution and sub-target suppression
- `tests/execution-engine-team/` — new chainsaw e2e

**Version floor.** Resolving `target` requires ark-sdk >= 0.1.68. Older engines ignore the field and continue serving direct agent queries unchanged; only team membership needs the newer SDK.
