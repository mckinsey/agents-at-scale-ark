# A2A Experimental Features

This directory contains experimental A2A (Agent-to-Agent) features that require A2A mode opt-in:

```yaml
annotations:
  ark.mckinsey.com/execution-mode: "a2a"
  # Legacy alternative:
  # ark.mckinsey.com/a2a-experimental-enabled: "true"
```

## ⚠️ Experimental Status

All features in this directory are **experimental** and:
- May change or be removed in future releases
- Require explicit opt-in via annotation
- Should not be used in production workloads without testing

## Features

| Directory | Feature | Status |
|-----------|---------|--------|
| [`agent-as-tool/`](./agent-as-tool/) | Agent-as-Tool with A2A message format | Experimental |

## Rollback Procedure

If A2A experimental mode opt-in needs to be rolled back:

1. **Remove this directory**: `rm -rf samples/a2a-experimental/`
2. **Remove experimental tests**: `rm -rf tests/a2a-experimental-*`
3. **Revert controller changes** that check A2A mode annotations
4. **Update documentation** to remove references to experimental features

## Testing

Each experimental feature has corresponding tests in `tests/a2a-experimental-*/`.

## Documentation

- [A2A Native Execution RFC](../../docs/content/reference/a2a-native-execution.mdx)
- [ARK Reference Documentation](../../docs/content/reference/)
