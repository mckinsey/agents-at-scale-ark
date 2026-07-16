# query-broker-event-delete-cleanup

Deleting a Query removes its operation events from the broker's Postgres backend.

## What it tests
- The controller finalizer calls `DELETE /events/:queryId` on the broker when a Query is deleted
- Events are looked up by the Query's UID (the convention operation events use), not its name
- After deletion, no rows remain in the `events` table for that query's UID

## Running
```bash
chainsaw test
```

Successful completion validates that broker events are cascade-deleted alongside the Query, closing the same orphan-row gap that `query-broker-delete-cleanup` closes for messages.
