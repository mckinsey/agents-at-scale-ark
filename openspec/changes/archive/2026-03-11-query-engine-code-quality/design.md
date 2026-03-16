## Context

`ProcessMessage` in `handler.go` is a 185-line function with complexity exceeding gocognit (>20), cyclop (>30), and gocyclo (>30) thresholds. It performs 7 sequential phases: metadata extraction, query fetch, context setup, input/memory loading, event stream setup, target dispatch, and response building. Each phase is independent and can be extracted.

`executeAgent` and `executeTeam` are nearly identical 15-line functions: fetch CRD → Make* → PrepareExecutionMessages → Execute → return. Both `Agent` and `Team` implement the `TeamMember` interface (`Execute`, `GetName`, `GetType`, `GetDescription`), so they can be unified.

## Goals / Non-Goals

**Goals:**
- Remove all 3 nolint directives from handler.go
- Fix all 5 SonarQube issues on PR #1321
- Keep behavior identical — pure refactor

**Non-Goals:**
- Changing execution logic or adding features
- Refactoring other files beyond the targeted issues

## Decisions

### 1. Extract ProcessMessage into phased methods

Split into methods on Handler, passing an `executionState` struct between phases:

```
ProcessMessage()
  ├── resolveQueryAndTarget(meta)          → query, target
  ├── setupExecution(ctx, query, target)   → executionState
  ├── dispatchTarget(ctx, state)           → messages, err
  └── buildA2AResponse(ctx, state, msgs)   → MessageProcessingResult
```

The `executionState` struct holds: query, target, sessionId, conversationId, inputMessages, memoryMessages, memory, eventStream, querySpan, targetSpan. This replaces 10+ local variables in ProcessMessage.

The `finalizeStream` closure becomes a method on `executionState`.

### 2. Unify executeAgent/executeTeam via TeamMember interface

Replace both with a single `executeMember` that takes a type string:

```go
func (h *Handler) executeMember(ctx, query, targetType, targetName, ...) (*ExecutionResult, []Message, error) {
    var member genai.TeamMember
    switch targetType {
    case "agent":
        // fetch Agent CRD, MakeAgent
    case "team":
        // fetch Team CRD, MakeTeam
    }
    currentMessage, contextMessages := genai.PrepareExecutionMessages(...)
    result, err := member.Execute(...)
    return result, result.Messages, nil
}
```

### 3. SonarQube fixes — minimal inline changes

- Blank import: add `// Required for cloud provider auth plugins` comment
- Noop emitters: add `// noop: satisfies EventEmitter interface` as function body
- Storage request: add `ephemeral-storage: 128Mi` to query engine resources in values.yaml

## Risks / Trade-offs

- **Refactor risk** → Mitigated by no logic changes, just extraction. Unit tests + chainsaw tests verify behavior.
- **executionState struct might feel over-engineered for 4 methods** → Keeps each method's signature clean and avoids passing 10+ parameters. Worth it at this size.
