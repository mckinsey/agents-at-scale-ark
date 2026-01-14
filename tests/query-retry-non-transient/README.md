# Query Retry Non-Transient Errors

Tests that non-transient error codes (400 Bad Request) do not trigger retries.

## What it tests
- 400 Bad Request is treated as non-transient
- Query fails immediately without retry attempts
- retryCount remains 0

## Running
```bash
chainsaw test ./tests/query-retry-non-transient --fail-fast
```

Successful completion validates that non-transient HTTP status codes fail immediately without triggering retries.
