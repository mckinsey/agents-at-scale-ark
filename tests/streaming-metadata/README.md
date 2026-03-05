# Streaming Metadata

Validates that streaming chunks arriving at ark-broker carry correct `ark` metadata across model, agent, and team query scenarios.

## What it tests
- Model-target query: chunks have `ark.query`, `ark.model` set
- Agent-target query: chunks have `ark.agent`, `ark.target`, `ark.model` set
- Team-target query: chunks have `ark.team`, `ark.agent`, `ark.model` set
- Final chunk per query has `ark.completedQuery` populated
- Chunk sequence numbers are ordered
- Stream completion is signaled

## Running
```bash
chainsaw test
```

Requires ark-broker with streaming enabled to be pre-deployed in default namespace.
