## 1. Refactor ProcessMessage complexity

- [x] 1.1 Define `executionState` struct holding query, target, sessionId, conversationId, inputMessages, memoryMessages, memory, eventStream, querySpan, targetSpan
- [x] 1.2 Extract `resolveQueryAndTarget(meta)` — metadata validation, query fetch, target resolution from spec or metadata fallback
- [x] 1.3 Extract `setupExecution(ctx, query, target)` — context values, telemetry, session, input messages, memory, event stream setup. Returns `executionState`
- [x] 1.4 Extract `dispatchTarget(ctx, state)` — target type switch, execution, error handling with telemetry
- [x] 1.5 Extract `buildA2AResponse(ctx, state, responseMessages)` — telemetry recording, memory save, token summary, response metadata, stream finalization
- [x] 1.6 Move `finalizeStream` from closure to method on `executionState`
- [x] 1.7 Rewrite `ProcessMessage` to call the 4 extracted methods, remove nolint directive

## 2. Eliminate executeAgent/executeTeam duplication

- [x] 2.1 Create `executeMember(ctx, query, targetType, targetName, inputMessages, memoryMessages, memory, eventStream)` using TeamMember interface with type switch for agent/team CRD fetch and Make*
- [x] 2.2 Update `dispatchTarget` to call `executeMember` for agent and team cases
- [x] 2.3 Remove `executeAgent` and `executeTeam`, remove dupl nolint directives

## 3. SonarQube fixes

- [x] 3.1 Add comment to blank import in `ark/cmd/query-engine/main.go`
- [x] 3.2 Add body comments to 3 empty noop emitter functions in `ark/internal/eventing/config/provider.go`
- [x] 3.3 Add `ephemeral-storage` request to query engine resources in `ark/dist/chart/values.yaml`

## 4. Verification

- [x] 4.1 Run `make lint-fix` — confirm 0 issues without nolint directives
- [x] 4.2 Run `make build` — confirm compilation
- [x] 4.3 Run `make test` — confirm unit tests pass
