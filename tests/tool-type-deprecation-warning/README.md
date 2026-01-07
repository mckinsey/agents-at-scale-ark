# Tool Type Deprecation Warning

Validates that using deprecated `type: custom` in agent tool references generates a warning with the agent and tool names.

## What it tests
- Agent with `type: custom` tool reference is accepted but generates deprecation warning
- Warning message includes agent name and tool name for actionable feedback
- Agent with explicit `type: mcp` does not generate deprecation warning

## Running
```bash
chainsaw test tests/tool-type-deprecation-warning
```

Successful test completion validates the deprecation warning system works correctly.
