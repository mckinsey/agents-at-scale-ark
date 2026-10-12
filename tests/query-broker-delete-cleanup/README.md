# query-broker-delete-cleanup

Deleting a Query with an explicit `spec.memory` removes its messages from the broker's Postgres backend.

## What it tests

- A query runs to completion and its messages are present in the broker for the named memory
- The controller finalizer removes those messages when the Query is deleted
- After deletion, no messages remain for that query

## Running

```bash
chainsaw test
```

Successful completion validates that broker messages are cascade-deleted alongside the Query, leaving no orphan rows for an explicitly named memory.
