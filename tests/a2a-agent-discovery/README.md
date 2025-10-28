# A2A Agent Discovery Test

Tests that mock-llm A2AServer resources are created and discovered by Ark.

## What it tests

- A2AServer CRDs are created when `ark.a2a.enabled=true`
- Both echo and countdown agents are discovered
- A2AServers reach Ready state
- Agent addresses are resolved correctly

## Resources created

- `mock-llm-echo` A2AServer
- `mock-llm-countdown` A2AServer
