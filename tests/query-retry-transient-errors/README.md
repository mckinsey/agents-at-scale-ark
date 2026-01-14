# Query Retry Transient Errors

Tests that all 7 transient error codes (408, 409, 429, 500, 502, 503, 504) trigger retries.

## What it tests
- All OpenAI SDK transient error codes trigger retries
- Sequential errors are handled correctly
- Query succeeds after 7 retries when 8th attempt succeeds
- retryCount reflects all retry attempts

## Running
```bash
chainsaw test ./tests/query-retry-transient-errors --fail-fast
```

Successful completion validates that transient HTTP status codes correctly trigger query retries.
