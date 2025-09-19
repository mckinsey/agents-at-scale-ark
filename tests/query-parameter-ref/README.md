# Query Parameters Ref Test

Tests query parameter reference functionality for agents.

## What it tests
- Agent referencing query parameters through queryParameterRef
- Parameter resolution from query to agent
- Agent prompt templating with query parameters
- Nested valueFrom resolution (Query parameter -> ConfigMap/Secret -> Agent)

## Test Cases

### Direct Parameter Reference
- Agent `test-agent` references query parameter with direct value
- Tests basic queryParameterRef functionality

### Nested ValueFrom Resolution
- Query parameters use valueFrom to reference ConfigMap/Secret
- Agent `test-agent-nested` references these query parameters via queryParameterRef
- Tests resolution chain: Agent -> Query param -> ConfigMap/Secret
- Validates that agents can use parameters that are themselves resolved from external sources

## Running
```bash
chainsaw test
```

Validates that agents can dynamically resolve parameters from queries, including nested resolution scenarios.