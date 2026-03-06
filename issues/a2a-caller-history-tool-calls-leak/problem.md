# A2A Caller History Leaks Internal Tool Call Messages to Delegated Agents

**Issue Status**: OPEN
**Issue Type**: BUG 🐛
**Severity**: Critical
**Branch**: `feat/a2a-native-execution-main-sync`

## Summary

When the A2A local execution engine delegates to child agents via tool calls, it passes the caller's **full conversation history** — including internal `assistant(tool_calls)` messages — to the delegated agent. The delegated agent's model adapter cannot pair these orphaned tool_call messages with results, causing Azure OpenAI to reject the request with a 400 error.

## Error

```
POST .../chat/completions: 400 Bad Request {
    "message": "An assistant message with 'tool_calls' must be followed by tool messages
    responding to each 'tool_call_id'. The following tool_call_ids did not have response
    messages: call_HP7XqSSp59tCKiRJBoEXZ8AH",
    "type": "invalid_request_error",
    "param": "messages.[5].role",
    "code": null
}
```

**Stack trace**: `A2ALocalEngine.Execute (line 75) → Agent.executeLocallyA2ANative → Agent.executeAgentA2A → Agent.ExecuteA2A → Team.selectMemberA2A`

## Present in Main?

**No.** The entire A2A execution path is new to our branch:
- `a2a_local_engine.go` — does not exist in main
- `openai_a2a_model_adapter.go` — does not exist in main
- `a2a_execution_local.go` — does not exist in main
- `selectMemberA2A`, `executeSelectorA2A`, `determineNextMemberA2A` — do not exist in main
- `WithDelegationCallerHistory` / `GetDelegationCallerHistory` — do not exist in main

## Consequence of Our Changes?

**Yes.** This is a regression introduced by our A2A branch's delegation pattern. Main's equivalent code (`AgentToolExecutor.Execute` at line 322-329 of `agent_tools.go`) explicitly passes **empty history** to delegated agents:

```go
// MAIN branch — agent_tools.go:322-329
// Prepare user input. No conversation history is ever provided
userInput := NewUserMessage(inputStr)
history := []Message{}
result, err := agent.Execute(ctx, userInput, history, nil, nil)
```

Our branch changed this to propagate the caller's full history:

```go
// OUR branch — agent_tools.go:604-607
execCtx := applyDelegationContext(ctx, invocation.contextID)
eventStream := getDelegationEventStream(ctx, call)
history := GetDelegationCallerHistory(ctx)
result, err := agent.ExecuteA2A(execCtx, invocation.a2aUserInput, history, nil, eventStream)
```

The `callerHistory` is set in `a2a_local_engine.go:95-97`:

```go
func (e *A2ALocalEngine) executeA2AToolCalls(ctx, toolCalls, eventStream, contextID, taskID, callerHistory []protocol.Message) {
    execCtx = WithDelegationCallerHistory(execCtx, callerHistory)
```

Where `callerHistory` is the engine's `agentMessages` — which includes `assistant(tool_calls)` messages from the caller's multi-turn execution.

## Reproduction Flow

### Selector team with coordinator agent:

1. `Team.executeSelectorA2A` → calls `Team.selectMemberA2A`
2. `selectMemberA2A` → calls `coordinator-agent-a2a.ExecuteA2A(ctx, userMsg, [systemMsg], nil, nil)`
3. Coordinator's `A2ALocalEngine.Execute` (Turn 1):
   - `agentMessages` = `[coordinator_sys, selector_sys, user]`
   - API returns `assistant(tool_calls:[call_A])` for `call-analysis-agent-a2a`
   - `agentMessages` becomes `[coord_sys, sel_sys, user, assistant(tool_calls:[call_A])]`
4. `executeA2AToolCalls` stores `agentMessages` as `callerHistory`:
   - `WithDelegationCallerHistory(ctx, [coord_sys, sel_sys, user, assistant(tool_calls:[call_A])])`
5. `AgentToolExecutor.Execute` retrieves caller history:
   - `history := GetDelegationCallerHistory(ctx)` → `[coord_sys, sel_sys, user, assistant(tool_calls:[call_A])]`
6. `analysis-agent-a2a.prepareA2ANativeMessages` builds:
   - `[analysis_sys] + callerHistory + [delegation_user]`
   - Result: `[analysis_sys(0), coord_sys(1), sel_sys(2), user(3), assistant(tool_calls:[call_A])(4), delegation_user(5)]`
7. Analysis agent's adapter converts to OpenAI format:
   - Message `[4]` is `assistant(tool_calls:[call_A])` with **no following tool response**
   - Message `[5]` is `user` role — not the expected `tool` role
   - `ensureAssistantToolCallsArePaired` cannot fix this: no cached outcomes for `call_A` (wrong adapter)
8. **Azure OpenAI rejects at `messages.[5].role`**

## Behavioural Comparison: Main vs A2A Branch

| Aspect | Main | A2A Branch |
|--------|------|-----------|
| **Message format** | `openai.ChatCompletionMessageParamUnion` | `protocol.Message` (A2A) |
| **Execution loop** | `Agent.executeLocally` | `A2ALocalEngine.Execute` |
| **Tool call storage** | `agentMessages` (direct OpenAI format, tool results appended inline) | `agentMessages` (A2A format, outcomes tracked separately via `toolOutcomes`) |
| **History to delegated agents** | **Empty** (`history := []Message{}`) | **Caller's full messages** (`GetDelegationCallerHistory(ctx)`) |
| **Tool result pairing** | Inline in `agentMessages` (assistant+tool consecutive) | Via `ensureAssistantToolCallsArePaired` + `cacheToolOutcomes` in adapter |
| **Selector agent** | `selectorAgent.Execute(ctx, userMsg, [systemMsg], nil, nil)` — no tools used | `selectorAgent.ExecuteA2A(ctx, userMsg, [systemMsg], nil, nil)` — coordinator has tools |

### Key Architectural Difference

Main's tool execution loop (`executeLocally`) appends tool result messages **directly** to `agentMessages`:

```go
// Main — agent.go:171-186
func (a *Agent) executeToolCalls(ctx, toolCalls, agentMessages, newMessages) {
    for _, tc := range toolCalls {
        toolMessage, err := a.executeToolCall(ctx, tc)
        *agentMessages = append(*agentMessages, toolMessage)  // ← result is inline
    }
}
```

Our A2A engine does NOT append tool results to `agentMessages`. Instead, it tracks them via `toolOutcomes` and relies on the adapter's `cacheToolOutcomes` + `ensureAssistantToolCallsArePaired` to reconstruct the correct message sequence when sending to the API:

```go
// Our branch — a2a_local_engine.go:42-79
turnResult, err := e.provider.A2ATurn(ctx, agentMessages, toolOutcomes, toolDefs, eventStream)
agentMessages = append(agentMessages, a2aAssistantMsg)  // ← only assistant, not tool results
// ...
toolOutcomes = outcomes  // ← tool results tracked separately
```

This means `agentMessages` in our engine contains assistant messages with tool_calls but NOT the corresponding tool result messages. When this array is passed as `callerHistory` to delegated agents, those agents receive unpaired tool_call messages that their own adapter cannot resolve.

## Scope of Impact

This affects ANY scenario where:
1. An agent with tools delegates to another agent via A2A
2. The delegated agent receives the caller's history
3. The caller's history contains `assistant(tool_calls)` messages

Specific patterns:
- **Selector teams**: Coordinator calls member agents as tools
- **Graph teams**: Any agent-as-tool invocation with history propagation
- **Nested teams**: Teams delegating to other teams via tools

## Feature Parity Requirements

The fix must ensure the A2A path matches main's capabilities:

1. **Delegated agents receive appropriate context** — not broken internal messages
2. **Tool call/result pairing is always valid** — Azure OpenAI strict validation passes
3. **Multi-turn selector flows work** — coordinator can make multiple tool calls across turns
4. **Streaming works** — event streams propagate correctly to delegated agents
5. **Telemetry records correctly** — token usage and traces for delegated executions

## Evidence

- Controller logs showing the 400 error (two separate occurrences with different `tool_call_id` values)
- Stack trace pointing to `a2a_local_engine.go:75` (tool execution error logging)
- Dashboard screenshots of selector team failure (`vibe_artifacts/pr1244-04-selector-team-schema-fix.png`)
- Main branch code explicitly using empty history for delegated agents
