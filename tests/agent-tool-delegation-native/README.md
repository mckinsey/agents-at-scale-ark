# Agent Tool Delegation Native

Validates native agent-as-tool delegation flow and response wiring.

## What it tests
- Coordinator agent invokes `delegate-agent-tool`
- Tool call delegates to `delegate-agent` and returns content
- Query completes with delegated response and A2A task metadata

## Running
```bash
chainsaw test tests/agent-tool-delegation-native
```

Successful completion confirms delegated tool-call path remains operational with native execution behavior.

