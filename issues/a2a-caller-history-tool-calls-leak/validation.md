# Validation: A2A Caller History Tool-Call Leakage

## Baseline (Pre-Fix) Evidence

### Reproduction target

- Team: `selector-test-team`
- Namespace: `default`
- Flow: selector -> coordinator agent -> delegated member agent via tool call

### Observed failure signature

- HTTP 400 from Azure OpenAI during delegated tool execution
- Error:
  - `An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'`
  - `param: messages.[5].role`
- Stack location:
  - `A2ALocalEngine.Execute` -> `Agent.ExecuteA2A` -> `Team.selectMemberA2A`

### Baseline source

- Captured and documented in:
  - `issues/a2a-caller-history-tool-calls-leak/problem.md`
- Failure scenario and message sequence documented in:
  - `issues/a2a-caller-history-tool-calls-leak/problem.md` (`Reproduction Flow` section)

## Implementation Validation

### Unit tests (focused)

- Command:
  - `go test ./internal/genai -run "TestFilterCallerHistory|TestExecuteA2AToolCallsPassesFilteredHistoryToDelegatedExecutor" -count=1 -v`
- Result:
  - Pass
  - Includes coverage for:
    - stripping data-part tool-call and tool-result payload messages
    - preserving system/user/plain assistant context
    - selector-shaped history
    - delegated executor receiving filtered caller history via context

### Package tests

- Command:
  - `go test ./internal/genai -count=1 -timeout 120s`
- Result:
  - Pass (`ok mckinsey.com/ark/internal/genai`)

## Deployed Dashboard Confirmation

### Environment

- Controller runtime:
  - `devspace dev --no-warn`
- Dashboard access:
  - `kubectl port-forward -n default svc/ark-dashboard 3000:3000`
- Namespace under test:
  - `default`

### Live test scenario

- Opened deployed dashboard at `http://localhost:3000`
- Navigated to team `selector-test-team` in `default`
- Prompt:
  - `What are the latest advances in quantum computing? Please research and analyze.`
- Result:
  - Success (completed response shown)
  - No visible chat/runtime error for this run

### Screenshot evidence

- Success response:
  - `vibe_artifacts/a2a-caller-history-dashboard-success.png`
- Debug traces for same run:
  - `vibe_artifacts/a2a-caller-history-dashboard-traces.png`

## Log Audit (Post-Fix)

### Command

- `kubectl logs -n ark-system deploy/ark-controller-devspace --since=20m`

### Checked patterns

- `Tool execution failed`
- `assistant message with 'tool_calls' must be followed`
- `messages.[n].role` pairing error markers

### Result

- No matches found in post-fix window for the tested run.

## Validation Conclusion

- The regression is resolved for the deployed selector-team path in `default`.
- The previously blocking `tool_calls` pairing error was not reproduced after the fix.
