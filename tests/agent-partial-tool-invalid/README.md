# Agent Partial Tool Invalid

Tests that an agent referencing a partial tool that does not exist is reported as unavailable rather than silently accepted.

## What it tests

- An agent whose partial tool reference cannot be resolved gets `Available=False`
- The condition carries `reason: ToolNotFound`, so the cause is visible without reading logs
- The agent is still admitted — a bad tool reference surfaces on status, it does not reject the resource

## Running

```bash
chainsaw test
```

Successful completion validates that an unresolvable partial tool reference fails loudly on the agent's status, the negative case for `agent-partial-tool-valuefrom`.
