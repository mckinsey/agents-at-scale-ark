## Why

Agent, team, selector, and graph execution loops use `[]Message` (OpenAI unions) as internal transport. Core orchestration is coupled to a single provider's message shape, preventing protocol-native execution.

## What Changes

- Convert `TeamMember` interface to accept and return `ProtocolMessage` types.
- Convert agent execution loop to use protocol messages internally, converting to OpenAI only at the model provider boundary.
- Convert team sequential, round-robin, selector, and graph loops to protocol-native history accumulation.
- Agent produces a sequence of ProtocolMessages (one per execution step) with extension attribution.
- Selector reads extension metadata for agent identity.
- Streaming events map 1:1 to the protocol message sequence.

## Capabilities

### New Capabilities
- `protocol-native-execution-loops`: Agent, team, selector, and graph orchestration uses protocol-native messages internally with OpenAI conversion only at provider boundaries.

### Modified Capabilities

## Impact

- `ark/executors/completions/types.go`
- `ark/executors/completions/execution_result.go`
- `ark/executors/completions/agent.go`
- `ark/executors/completions/agent_tools.go`
- `ark/executors/completions/team.go`
- `ark/executors/completions/team_graph.go`
- `ark/executors/completions/team_selector.go`
- `ark/executors/completions/execution_engine.go`
- `ark/executors/completions/a2a_execution.go`
