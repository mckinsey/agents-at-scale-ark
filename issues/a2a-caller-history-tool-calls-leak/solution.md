# Solution: Filter Internal Tool-Orchestration Messages from Delegation History

## Decision

Implemented Approach B from `investigation.md`:

- Filter caller history at the delegation boundary in `A2ALocalEngine`.
- Preserve conversational context.
- Remove internal orchestration messages that can break downstream model validation.

## Code Changes

### 1) Delegation boundary filtering

- File: `ark/internal/genai/a2a_local_engine.go`
- Change:
  - Before writing delegation history into context, apply:
    - `filterCallerHistoryForDelegation(callerHistory)`

### 2) Filter helpers

- File: `ark/internal/genai/a2a_local_engine.go`
- Added:
  - `filterCallerHistoryForDelegation(messages []protocol.Message) []protocol.Message`
  - `messageContainsToolCallPayload(msg protocol.Message) bool`
  - `messageContainsToolResultPayload(msg protocol.Message) bool`

### 3) Tool-call shape coverage

The filter now strips tool-call messages represented in both forms:

- Payload form (`DataPart` schema):
  - `A2APayloadSchemaToolCallsV1`
- Metadata form:
  - `MetadataToolCallsKey` (for messages carrying tool-call metadata directly)

Tool-result payload messages are also stripped via:

- `A2APayloadSchemaToolResultV1`

## Why This Fix Works

- The delegated agent receives clean caller context (system/user/plain assistant).
- Internal caller execution state (`assistant(tool_calls)` and tool-result internals) is not forwarded to child agents.
- This prevents delegated adapters/providers from seeing orphaned tool-call IDs they cannot pair, which is what triggered the Azure OpenAI 400.

## Tests Added/Updated

- File: `ark/internal/genai/a2a_local_engine_test.go`
- Added coverage:
  - `TestFilterCallerHistoryForDelegationStripsToolCallsAndResults`
  - `TestFilterCallerHistoryForDelegationPreservesEmptyHistory`
  - `TestFilterCallerHistoryForDelegationPreservesPlainMessages`
  - `TestFilterCallerHistoryMatchesSelectorTeamBugScenario`
  - `TestExecuteA2AToolCallsPassesFilteredHistoryToDelegatedExecutor`

The last test confirms filtered history is what delegated executors receive from context, not just what helper functions return in isolation.

## Feature-Capability Assessment vs Main

- Main behavior: delegated tools get empty history.
- A2A fixed behavior: delegated tools get meaningful context but without malformed internal call-chain state.
- Net effect:
  - Retains the branch intent of team-history support.
  - Eliminates the specific `tool_calls` ordering failure.

## Residual Risks

1. Internal message schemas may evolve (new internal payload types) and require extending the filter.
2. If future components rely on delegated visibility into caller tool orchestration, this filter will intentionally hide it.
3. Additional nested team/graph permutations should continue to be validated in integration runs as A2A evolves.

## Follow-Up (Optional Hardening)

- Add an integration regression test that simulates nested delegation with mixed metadata/payload tool-call representations across turns.
- Consider centralizing this policy in a dedicated delegation-history utility to keep producer/consumer behavior aligned.
