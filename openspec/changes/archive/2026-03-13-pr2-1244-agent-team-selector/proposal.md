# PR2 Agent Team Selector Protocol Loops

## Why

Agent, team, and selector execution loops still use OpenAI message unions as internal transport. That keeps core orchestration coupled to provider-specific message shape.

## What Changes

- Convert `TeamMember` and selector interfaces to protocol-native message types.
- Convert agent execution loops to accept protocol messages and keep OpenAI conversion at model/provider boundaries.
- Convert team, graph, and selector loops to protocol-native history accumulation.
- Keep handler/controller compatibility by converting protocol outputs back to OpenAI only at call boundaries.

## Impact

- `ark/executors/completions/agent.go`
- `ark/executors/completions/team.go`
- `ark/executors/completions/team_graph.go`
- `ark/executors/completions/team_selector.go`
- `ark/executors/completions/execution_engine.go`
- `ark/executors/completions/a2a_execution.go`
- `ark/executors/completions/agent_tools.go`
- `ark/executors/completions/handler.go`
- `ark/internal/controller/query_controller.go`
