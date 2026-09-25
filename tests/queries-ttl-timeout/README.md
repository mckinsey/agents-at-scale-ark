# Queries TTL Timeout

Tests that a Query which exceeds its `spec.timeout` terminates in the error phase.

## What it tests

- A Query with `spec.timeout: 1ms` against a mock-llm backed agent cannot finish in time
- The Query still reaches `Completed`, so it terminates rather than hanging
- Its terminal `status.phase` is `error`, not `done`

## Running

```bash
chainsaw test
```

Successful completion validates that `spec.timeout` is enforced and that an expired Query ends in a terminal error state instead of running indefinitely.
