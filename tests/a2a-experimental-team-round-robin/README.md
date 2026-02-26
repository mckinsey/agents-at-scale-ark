# A2A Native Team Round-Robin Test

Tests round-robin team execution with A2A native mode enabled.

## What it tests

- Round-robin team execution uses A2A execution path (`executeRoundRobinA2A`)
- Query executes through A2A mode by default
- Agents (brainstormer, critic, coordinator) cycle through in round-robin fashion
- Coordinator uses terminate tool to end conversation with summary

## A2A Features Validated

- Default A2A execution on Query resource
- A2A-enabled round-robin team execution flow
- Tool calls (terminate) work correctly in A2A mode
- Message cycling through team members in A2A format

## Mock-LLM Configuration

Uses mock-llm with `ark.a2a.enabled: true` to:
- Create A2A server resources automatically
- Provide deterministic responses for each agent
- Simulate terminate tool call from coordinator
- Enable reliable CI/CD testing

## Running

```bash
chainsaw test
```

## Expected Assertions

1. Model becomes available
2. All agents (brainstormer, critic, coordinator) become available
3. Team becomes available
4. Query completes with phase: done
5. Response target is round-robin-brainstorm-team
6. Response content length > 100 (meaningful summary from terminate tool)
