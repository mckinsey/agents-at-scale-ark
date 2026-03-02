# Execution Engine Default

Validates that Ark deploys a default ExecutionEngine CR in `ark-system` and that queries fail when no engine exists.

## What it tests
- Default `ark-default` ExecutionEngine exists in `ark-system` with `Ready` phase
- Queries execute successfully when the default engine is present
- Queries fail with `error` phase when the default engine is deleted
- Engine can be restored after deletion

## Running
```bash
chainsaw test
```

Successful completion confirms the default ExecutionEngine is required for query execution.
