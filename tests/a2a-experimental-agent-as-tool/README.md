# A2A Agent-as-Tool Message Test

Tests A2A-native agent-as-tool delegation with full message format (message, history, contextId).

## What it tests

- A2A annotation enables rich message passing between coordinator and specialist
- Tool inputSchema correctly exposes message, history, contextId properties
- Coordinator can invoke specialist with structured A2A message format
- Response propagates back through the delegation chain

## Components

| File | Purpose |
|------|---------|
| `manifests/a01-specialist-agent.yaml` | A2A-enabled specialist that receives delegated tasks |
| `manifests/a02-agent-tool.yaml` | Agent-as-tool with A2A inputSchema |
| `manifests/a03-coordinator.yaml` | A2A-enabled coordinator that delegates with rich messages |
| `manifests/a04-query.yaml` | Test query to trigger delegation flow |
| `mock-llm-values.yaml` | Mock LLM responses for deterministic testing |

## Test Flow

```
Query (A2A) --> Coordinator Agent --> call-specialist-a2a (Tool) --> Specialist Agent
                     ^                                                    |
                     |_____________ response propagation ________________|
```

## Running

```bash
chainsaw test --test-dir tests/a2a-agent-as-tool-message
```

## Related

- [A2A Native Execution RFC](../../docs/content/reference/a2a-native-execution.mdx)
- [Agent-as-Tool Samples](../../samples/agents-as-tools/)
- [A2A Message Context Test](../a2a-message-context/) - Tests contextId propagation
