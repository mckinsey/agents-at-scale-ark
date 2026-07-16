# event-broker-postgres

Verifies that operation events from a completed query land in the Postgres `events` table with `expires_at` set.

## What it tests
- A query completes with `phase: done`
- The broker writes at least one event to the Postgres `events` table with `query_id='events-broker-query'` and a non-null `expires_at`
- `GET /events/:queryId` returns those events via the broker HTTP API
- Requires the broker running with postgres event backend (`postgresql: "true"` label)

## Running
```bash
chainsaw test
```

Requires a cluster set up with `--storage-backend postgresql` (which configures the broker with `EVENT_BACKEND=postgres`).
