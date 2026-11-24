# query-broker-delete-cleanup-default

Deleting a Query with no `spec.memory` falls back to the `default` Memory and removes its messages from the broker's Postgres backend.

## What it tests

- A query with no `spec.memory` set has its messages recorded against the `default` Memory
- The controller finalizer resolves that same fallback on delete, rather than skipping cleanup because no memory was named
- After deletion, no messages remain for that query

## Running

```bash
chainsaw test
```

Successful completion validates that the default-memory fallback is applied consistently on write and on delete, closing the orphan-row gap `query-broker-delete-cleanup` closes for explicitly named memories.
