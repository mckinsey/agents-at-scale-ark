# A2A Agent-as-Tool Message Test

Tests A2A-native agent-as-tool delegation parity across structured and fallback input formats.

## What it tests

- Structured delegation with `message + history + contextId`
- Structured delegation with `message` only
- Legacy `input` fallback in native mode
- Response propagation through coordinator -> tool -> specialist path for all scenarios

## Components

| File | Purpose |
| ---- | ------- |
| `manifests/a01-specialist-agent.yaml` | A2A-enabled specialist that receives delegated tasks |
| `manifests/a02-agent-tool.yaml` | Agent-as-tool with A2A inputSchema |
| `manifests/a03-coordinator.yaml` | A2A-enabled coordinator that delegates with rich messages |
| `manifests/a04-query.yaml` | Query for `message + history + contextId` scenario |
| `manifests/a05-query-message-only.yaml` | Query for `message`-only scenario |
| `manifests/a06-query-input-fallback.yaml` | Query for legacy `input` fallback scenario |
| `mock-llm-values.yaml` | Mock LLM responses for deterministic testing |

## Test Flow

```text
Query (A2A) --> Coordinator Agent --> call-specialist-a2a (Tool) --> Specialist Agent
                     ^                                                    |
                     |_____________ response propagation ________________|
```

## Running

```bash
chainsaw test --test-dir tests/a2a-experimental-agent-as-tool
```

## Related

- [A2A Native Execution RFC](../../docs/content/reference/a2a-native-execution.mdx)
- [Agent-as-Tool Samples](../../samples/a2a-experimental/agent-as-tool/)
- [A2A Message Context Test](../a2a-message-context/) - Tests contextId propagation
