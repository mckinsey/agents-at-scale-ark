# Agent Inline Tool Type

Tests that an agent can reference a `type: inline` tool.

## What it tests
- An agent with `spec.tools[].type: inline` is admitted rather than rejected
- Regression coverage for `validateAgentTool` denying inline tools with
  `unsupported tool type 'inline'`, which only surfaced in a real cluster

## Running
```bash
chainsaw test
```

Successful completion validates that the agent admission webhook accepts the `inline` tool type.
