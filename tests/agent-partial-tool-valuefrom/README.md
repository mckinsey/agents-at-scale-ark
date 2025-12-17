# Agent Partial Tool ValueFrom

Tests that partial tool parameters can use `valueFrom` to reference ConfigMaps, Secrets, and Query parameters.

## What it tests

- Partial tool parameter with `valueFrom.configMapKeyRef`
- Partial tool parameter with `valueFrom.queryParameterRef`
- Mixed usage of `value` and `valueFrom` in partial parameters

## Running

```bash
chainsaw test ./tests/agent-partial-tool-valuefrom --fail-fast
```

Successful completion validates that partial tool parameters support the same `valueFrom` pattern used elsewhere in Ark.
