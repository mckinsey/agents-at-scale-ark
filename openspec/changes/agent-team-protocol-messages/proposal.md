## Why

`TeamMember.Execute` and `Agent.executeLocally` / `prepareMessages` operate on `Message` (alias for `openai.ChatCompletionMessageParamUnion`). This means all agent and team orchestration logic is coupled to OpenAI types. Moving to protocol-typed messages internally allows the orchestration layer to be engine-agnostic while maintaining backward compatibility through adapters.

## What Changes

- Define `ProtocolTeamMember` interface with `Execute` accepting `protocol.Message` inputs and returning `[]protocol.Message`
- Add `ProtocolAgent` methods (`executeLocallyProtocol`, `prepareMessagesProtocol`) that operate on `protocol.Message`
- Implement adapter methods that bridge between `Message` (OpenAI) and `protocol.Message` for existing callers
- Update team orchestration (`team.go`, `team_graph.go`, `team_selector.go`) to support either interface through a shared dispatcher

## Non-goals

- Removing the existing `TeamMember` interface or `Message` type alias
- Changing the OpenAI API call path within `executeLocally` (provider calls remain OpenAI-typed)
- Modifying the execution result structure

## Compatibility Contract

- Existing `TeamMember` interface and implementations continue to work unchanged
- `ProtocolTeamMember` is additive — implementations can adopt it incrementally
- Team orchestration supports both interface variants through dispatch logic
- Adapter methods bridge between types with full fidelity (roles, content, tool calls preserved)
- Mixed deployments where some agents implement `ProtocolTeamMember` and others implement `TeamMember` are explicitly supported

## Impact

- `ark/executors/completions/types.go` (`ProtocolTeamMember` interface, adapter types)
- `ark/executors/completions/agent.go` (protocol-typed methods + adapters)
- `ark/executors/completions/team.go` (dispatcher for both interfaces)
- `ark/executors/completions/team_graph.go` (dispatcher support)
- `ark/executors/completions/team_selector.go` (dispatcher support)
